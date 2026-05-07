import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { syncProjectX } from "../_shared/projectxSync.ts";

const RATE_LIMIT_SECONDS = 60;
const STALE_SYNCING_SECONDS = 180;
const MANUAL_REFRESH_LOOKBACK_HOURS = 48;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed." }, 405);

  const supabase = createAdminClient();
  const requestId = crypto.randomUUID();

  try {
    await requireOwnerUserId(req, supabase, requestId);
    const retryAfterSeconds = await refreshRetryAfterSeconds(supabase);

    if (retryAfterSeconds > 0) {
      console.log(JSON.stringify({
        scope: "refresh_now",
        requestId,
        event: "rate_limited",
        retryAfterSeconds,
      }));
      return jsonResponse({
        ok: false,
        status: "rate_limited",
        message: "אפשר לרענן שוב בעוד דקה",
        retry_after_seconds: retryAfterSeconds,
      }, 429);
    }

    const accountIds = await loadCurrentProjectXAccountIds(supabase);
    const rangeEnd = new Date();
    const rangeStart = new Date(rangeEnd.getTime() - MANUAL_REFRESH_LOOKBACK_HOURS * 60 * 60 * 1000);

    console.log(JSON.stringify({
      scope: "refresh_now",
      requestId,
      event: "invoke_direct_sync",
      ownerVerified: true,
      currentAccountsCount: accountIds.length,
      accounts: accountIds.map(maskAccountId),
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
    }));

    const syncResult = await syncProjectX(supabase, {
      requestId,
      accountIds,
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
    });
    const syncStatus = await loadSyncStatus(supabase);

    console.log(JSON.stringify({
      scope: "refresh_now",
      requestId,
      event: "success",
      accountsSynced: syncResult.accountsSynced,
      tradesUpserted: syncResult.tradesUpserted,
      duplicatesSkipped: syncResult.duplicatesSkipped,
    }));

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
    console.log(JSON.stringify({
      scope: "refresh_now",
      requestId,
      event: "error",
      errorName: error instanceof Error ? error.name : typeof error,
      message,
    }));
    return jsonResponse({ ok: false, status: "error", message }, status);
  }
});

async function requireOwnerUserId(
  req: Request,
  supabase: ReturnType<typeof createAdminClient>,
  requestId: string,
) {
  const token = bearerToken(req);
  if (!token) {
    const error = new Error("פג תוקף ההתחברות, התחבר מחדש");
    error.name = "Unauthorized";
    throw error;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    const authError = new Error("פג תוקף ההתחברות, התחבר מחדש");
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

  console.log(JSON.stringify({
    scope: "refresh_now",
    requestId,
    event: "owner_verified",
    authenticated: true,
    ownerVerified: true,
  }));

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

async function loadCurrentProjectXAccountIds(supabase: ReturnType<typeof createAdminClient>) {
  const { data, error } = await supabase
    .from("accounts")
    .select("external_account_id")
    .eq("external_source", "projectx")
    .eq("is_current_account", true)
    .eq("show_in_main_selector", true)
    .eq("is_archived", false)
    .eq("cycle_status", "active")
    .not("external_account_id", "is", null);

  if (error) throw error;

  const accountIds = [...new Set(
    (data ?? [])
      .map((account) => String(account.external_account_id ?? "").trim())
      .filter((accountId) => /^\d+$/.test(accountId)),
  )];

  if (accountIds.length === 0) {
    throw new Error("לא נמצאו חשבונות נוכחיים לסנכרון");
  }

  return accountIds;
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
  if (error instanceof Error) return error.message;
  return "הרענון נכשל";
}

function maskAccountId(accountId: string) {
  if (accountId.length <= 4) return `${accountId.slice(0, 1)}***`;
  return `${accountId.slice(0, 2)}***${accountId.slice(-2)}`;
}
