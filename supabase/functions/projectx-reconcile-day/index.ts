import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { assertSyncSecret, readProjectXAccountIds } from "../_shared/projectxClient.ts";
import { normalizeFillsToTrades } from "../_shared/normalizer.ts";
import {
  loadAccountConfigs,
  loadRawFillsForDay,
  updateSyncStatus,
  upsertNormalizedTrades,
} from "../_shared/syncPersistence.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createAdminClient();

  try {
    assertSyncSecret(req);
    const body = (await req.json().catch(() => ({}))) as { date?: string };
    const date = body.date;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonResponse({ ok: false, error: "Missing date in YYYY-MM-DD format." }, 400);
    }

    await updateSyncStatus(supabase, "syncing", "מסנכרן...");

    const fills = await loadRawFillsForDay(supabase, date);
    const accountIds = readProjectXAccountIds();
    const effectiveAccountIds = accountIds.length > 0
      ? accountIds
      : [...new Set(fills.map((fill) => fill.external_account_id).filter(Boolean))];
    const accountConfigs = await loadAccountConfigs(supabase, effectiveAccountIds);
    const normalizedTrades = await normalizeFillsToTrades(fills, accountConfigs);
    const { upserted, duplicatesSkipped } = await upsertNormalizedTrades(supabase, normalizedTrades);

    await updateSyncStatus(supabase, "ok", "עודכן עכשיו");

    return jsonResponse({
      ok: true,
      date,
      fillsCount: fills.length,
      tradesUpserted: upserted,
      duplicatesSkipped,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ProjectX reconcile error.";
    await updateSyncStatus(supabase, "error", message).catch(() => undefined);
    return jsonResponse(
      { ok: false, error: message },
      error instanceof Error && error.name === "Unauthorized" ? 401 : 500,
    );
  }
});
