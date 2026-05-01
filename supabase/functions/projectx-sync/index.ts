import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import {
  assertSyncSecret,
  ProjectXClient,
  projectXAdapterTodoMessage,
  readProjectXAccountIds,
  readProjectXConfig,
} from "../_shared/projectxClient.ts";
import { normalizeFillsToTrades, type RawFillRow } from "../_shared/normalizer.ts";
import {
  loadAccountConfigs,
  updateSyncStatus,
  upsertRawFills,
  upsertRawOrders,
  upsertNormalizedTrades,
  type RawFillInsert,
  type RawOrderInsert,
} from "../_shared/syncPersistence.ts";

type SyncRequest = {
  rangeStart?: string;
  rangeEnd?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createAdminClient();
  let runId: string | null = null;

  try {
    assertSyncSecret(req);
    await updateSyncStatus(supabase, "syncing", "מסנכרן...");

    const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as SyncRequest) : {};
    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setDate(defaultStart.getDate() - 7);
    const rangeStart = body.rangeStart ?? defaultStart.toISOString();
    const rangeEnd = body.rangeEnd ?? now.toISOString();

    const { data: run, error: runError } = await supabase
      .from("projectx_sync_runs")
      .insert({
        status: "running",
        range_start: rangeStart,
        range_end: rangeEnd,
      })
      .select("id")
      .single();

    if (runError) throw runError;
    runId = run.id;

    const accountIds = readProjectXAccountIds();
    if (accountIds.length === 0) {
      throw new Error("Missing PROJECTX_ACCOUNT_IDS.");
    }

    const client = new ProjectXClient(readProjectXConfig());
    const accountConfigs = await loadAccountConfigs(supabase, accountIds);
    const allFills: RawFillRow[] = [];
    let ordersCount = 0;

    for (const accountId of accountIds) {
      const orders = await client.fetchOrders({ accountId, rangeStart, rangeEnd });
      const fills = await client.fetchFills({ accountId, rangeStart, rangeEnd });
      ordersCount += orders.length;
      const rawOrders = mapProjectXOrders(orders, accountId);
      const rawFills = mapProjectXFills(fills, accountId);

      await upsertRawOrders(supabase, rawOrders);
      await upsertRawFills(supabase, rawFills);

      allFills.push(...rawFills);
    }

    const normalizedTrades = await normalizeFillsToTrades(allFills, accountConfigs);
    const { upserted, duplicatesSkipped } = await upsertNormalizedTrades(supabase, normalizedTrades);

    await supabase
      .from("projectx_sync_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        accounts_synced: accountIds.length,
        orders_count: ordersCount,
        fills_count: allFills.length,
        trades_upserted: upserted,
        duplicates_skipped: duplicatesSkipped,
      })
      .eq("id", runId);

    await updateSyncStatus(supabase, "ok", "עודכן עכשיו");

    return jsonResponse({
      ok: true,
      accountsSynced: accountIds.length,
      ordersCount,
      fillsCount: allFills.length,
      tradesUpserted: upserted,
      duplicatesSkipped,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ProjectX sync error.";
    const statusCode = message === projectXAdapterTodoMessage ? 501 : error instanceof Error && error.name === "Unauthorized" ? 401 : 500;

    try {
      await updateSyncStatus(supabase, "error", message);
    } catch {
      // Keep the function response safe even if status persistence fails.
    }
    if (runId) {
      try {
        await supabase
          .from("projectx_sync_runs")
          .update({
            status: "error",
            finished_at: new Date().toISOString(),
            error_message: message,
          })
          .eq("id", runId);
      } catch {
        // Response body below is the source of truth if run logging fails.
      }
    }

    return jsonResponse({ ok: false, error: message }, statusCode);
  }
});

function mapProjectXOrders(orders: Record<string, unknown>[], fallbackAccountId: string): RawOrderInsert[] {
  return orders.map((order) => ({
    external_order_id: stringOrNull(order.id ?? order.orderId ?? order.externalOrderId),
    external_account_id: stringOrNull(order.accountId ?? order.externalAccountId ?? fallbackAccountId),
    platform_order_id: stringOrNull(order.platformOrderId),
    exchange_order_id: stringOrNull(order.exchangeOrderId),
    contract_name: stringOrNull(order.contractName ?? order.contract ?? order.symbol),
    status: stringOrNull(order.status),
    type: stringOrNull(order.type ?? order.orderType),
    side: stringOrNull(order.side ?? order.action),
    size: numberOrNull(order.size ?? order.quantity ?? order.qty),
    created_at_projectx: stringOrNull(order.createdAt ?? order.createdAtProjectX),
    filled_at_projectx: stringOrNull(order.filledAt ?? order.filledAtProjectX),
    trade_day: stringOrNull(order.tradeDay ?? order.tradeDate),
    execute_price: numberOrNull(order.executePrice ?? order.price),
    stop_price: numberOrNull(order.stopPrice),
    limit_price: numberOrNull(order.limitPrice),
    position_disposition: stringOrNull(order.positionDisposition),
    creation_disposition: stringOrNull(order.creationDisposition),
    rejection_reason: stringOrNull(order.rejectionReason),
    raw_payload: order,
  }));
}

function mapProjectXFills(fills: Record<string, unknown>[], fallbackAccountId: string): RawFillInsert[] {
  return fills.map((fill) => ({
    external_fill_id: stringOrNull(fill.id ?? fill.fillId ?? fill.externalFillId),
    external_order_id: stringOrNull(fill.orderId ?? fill.externalOrderId),
    external_account_id: String(fill.accountId ?? fill.externalAccountId ?? fallbackAccountId),
    contract_name: String(fill.contractName ?? fill.contract ?? fill.symbol ?? ""),
    side: String(fill.side ?? fill.action ?? ""),
    size: Number(fill.size ?? fill.quantity ?? fill.qty ?? 0),
    price: Number(fill.price ?? fill.fillPrice ?? 0),
    fill_time: String(fill.fillTime ?? fill.timestamp ?? fill.createdAt ?? ""),
    commission: fill.commission === undefined || fill.commission === null ? null : Number(fill.commission),
    raw_payload: fill,
  }));
}

function stringOrNull(value: unknown) {
  return value === undefined || value === null ? null : String(value);
}

function numberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}
