import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";

const RATE_LIMIT_SECONDS = 60;
const STALE_SYNCING_SECONDS = 180;
const MANUAL_REFRESH_LOOKBACK_HOURS = 48;
const PROJECTX_SYNC_TIMEOUT_MS = 55_000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed." }, 405);

  const supabase = createAdminClient();

  try {
    await requireOwnerUserId(req, supabase);
    const retryAfterSeconds = await refreshRetryAfterSeconds(supabase);

    if (retryAfterSeconds > 0) {
      return jsonResponse({
        ok: false,
        status: "rate_limited",
        message: "אפשר לרענן שוב בעוד דקה",
        retry_after_seconds: retryAfterSeconds,
      }, 429);
    }

    const syncResult = await invokeProjectXSync();
    const syncStatus = await loadSyncStatus(supabase);

    return jsonResponse({
      ok: true,
      status: "ok",
      message: "הנתונים עודכנו",
      last_success_at: syncStatus?.last_success_at ?? null,
      accounts_synced: numberOrZero(syncResult.accountsSynced),
      trades_upserted: numberOrZero(syncResult.tradesUpserted),
      duplicates_skipped: numberOrZero(syncResult.duplicatesSkipped),
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    const status = error instanceof Error && error.name === "Unauthorized" ? 401 : 500;
    if (status !== 401) {
      await markRefreshError(supabase, message).catch(() => null);
    }
    return jsonResponse({ ok: false, status: "error", message }, status);
  }
});

async function requireOwnerUserId(req: Request, supabase: ReturnType<typeof createAdminClient>) {
  const token = bearerToken(req);
  if (!token) {
    const error = new Error("נדרשת התחברות כדי לרענן נתונים");
    error.name = "Unauthorized";
    throw error;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    const authError = new Error("נדרשת התחברות כדי לרענן נתונים");
    authError.name = "Unauthorized";
    throw authError;
  }

  const { data: owner, error: ownerError } = await supabase
    .from("app_owner")
    .select("user_id")
    .eq("id", true)
    .maybeSingle();

  if (ownerError) throw ownerError;
  if (owner?.user_id !== data.user.id) {
    const ownerError = new Error("אין הרשאה לרענון נתונים");
    ownerError.name = "Unauthorized";
    throw ownerError;
  }

  return data.user.id;
}

function bearerToken(req: Request) {
  const authorization = req.headers.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function refreshRetryAfterSeconds(supabase: ReturnType<typeof createAdminClient>) {
  const syncStatus = await loadSyncStatus(supabase);
  const lastAttemptAt = syncStatus?.last_attempt_at ? new Date(syncStatus.last_attempt_at).getTime() : 0;
  if (!lastAttemptAt || Number.isNaN(lastAttemptAt)) return 0;

  const elapsedSeconds = Math.floor((Date.now() - lastAttemptAt) / 1000);
  if (syncStatus?.status === "syncing") {
    return elapsedSeconds > STALE_SYNCING_SECONDS ? 0 : Math.max(1, STALE_SYNCING_SECONDS - elapsedSeconds);
  }

  return Math.max(0, RATE_LIMIT_SECONDS - elapsedSeconds);
}

async function loadSyncStatus(supabase: ReturnType<typeof createAdminClient>) {
  const { data, error } = await supabase
    .from("sync_status")
    .select("status, last_attempt_at, last_success_at")
    .eq("id", "projectx")
    .maybeSingle();

  if (error) throw error;
  return data as { status: string | null; last_attempt_at: string | null; last_success_at: string | null } | null;
}

async function invokeProjectXSync() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/+$/, "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const syncSecret = Deno.env.get("PROJECTX_SYNC_SECRET");

  if (!supabaseUrl || !serviceRoleKey || !syncSecret) {
    throw new Error("ProjectX עדיין לא הוגדר");
  }

  const rangeEnd = new Date();
  const rangeStart = new Date(rangeEnd.getTime() - MANUAL_REFRESH_LOOKBACK_HOURS * 60 * 60 * 1000);

  const response = await fetch(`${supabaseUrl}/functions/v1/projectx-sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
      "x-projectx-sync-secret": syncSecret,
    },
    body: JSON.stringify({
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
    }),
    signal: AbortSignal.timeout(PROJECTX_SYNC_TIMEOUT_MS),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || payload.ok === false) {
    throw new Error(typeof payload.error === "string" ? payload.error : "הרענון נכשל");
  }

  return payload;
}

async function markRefreshError(supabase: ReturnType<typeof createAdminClient>, message: string) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("sync_status").upsert({
    id: "projectx",
    status: "error",
    last_attempt_at: now,
    message,
    is_reconnecting: false,
    updated_at: now,
  }, { onConflict: "id" });

  if (error) throw error;
}

function numberOrZero(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function safeErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "הרענון לקח יותר מדי זמן. נסה שוב בעוד דקה.";
  }
  if (error instanceof Error) return error.message;
  return "הרענון נכשל";
}
