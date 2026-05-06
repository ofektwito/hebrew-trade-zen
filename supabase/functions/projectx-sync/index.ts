import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import {
  assertSyncSecret,
  ProjectXClient,
  readProjectXAccountIds,
  readProjectXConfig,
} from "../_shared/projectxClient.ts";
import { normalizeFillsToTrades, type AccountConfig, type RawFillRow } from "../_shared/normalizer.ts";
import {
  loadAccountConfigs,
  loadOwnerUserId,
  updateSyncStatus,
  upsertProjectXAccounts,
  upsertRawFills,
  upsertRawOrders,
  upsertNormalizedTrades,
  type RawFillInsert,
  type RawOrderInsert,
} from "../_shared/syncPersistence.ts";

type SyncRequest = {
  rangeStart?: string;
  rangeEnd?: string;
  dryRun?: boolean;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createAdminClient();
  let runId: string | null = null;

  try {
    assertSyncSecret(req);
    const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as SyncRequest) : {};
    const dryRun = body.dryRun === true;
    if (!dryRun) {
      await updateSyncStatus(supabase, "syncing", "מסנכרן...");
    }

    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setDate(defaultStart.getDate() - (dryRun ? 1 : 7));
    const rangeStart = body.rangeStart ?? defaultStart.toISOString();
    const rangeEnd = body.rangeEnd ?? now.toISOString();

    if (!dryRun) {
      const ownerUserId = await loadOwnerUserId(supabase);
      const { data: run, error: runError } = await supabase
        .from("projectx_sync_runs")
        .insert({
          user_id: ownerUserId,
          status: "running",
          range_start: rangeStart,
          range_end: rangeEnd,
        })
        .select("id")
        .single();

      if (runError) throw runError;
      runId = run.id;
    }

    const client = new ProjectXClient(readProjectXConfig());
    let accountIds = readProjectXAccountIds();
    let accountConfigs: AccountConfig[] = [];
    const sampleAccountPayloads: Array<Record<string, unknown>> = [];
    let activeAccountsCount: number | null = null;

    if (accountIds.length === 0) {
      const activeAccounts = await client.fetchAccounts(true);
      activeAccountsCount = activeAccounts.length;
      const allAccounts = await fetchAllAccountsSafely(client, activeAccounts);
      if (allAccounts.length === 0) {
        throw new Error("לא נמצאו חשבונות ProjectX פעילים");
      }
      sampleAccountPayloads.push(...allAccounts.slice(0, 1) as Array<Record<string, unknown>>);
      accountIds = allAccounts.map((account) => String(account.id));
      accountConfigs = dryRun
        ? allAccounts.map((account) => ({
            account_id: null,
            external_account_id: String(account.id),
            commission_per_contract: 0,
          }))
        : await upsertProjectXAccounts(supabase, allAccounts);
    } else {
      accountConfigs = await loadAccountConfigs(supabase, accountIds);
    }

    const allFills: RawFillRow[] = [];
    const sampleOrderPayloads: Array<Record<string, unknown>> = [];
    const sampleTradeExecutionPayloads: Array<Record<string, unknown>> = [];
    let ordersCount = 0;

    for (const accountId of accountIds) {
      const orders = await client.fetchOrders({ accountId, rangeStart, rangeEnd });
      const fills = await client.fetchFills({ accountId, rangeStart, rangeEnd });
      ordersCount += orders.length;
      sampleOrderPayloads.push(...orders.slice(0, 1));
      const rawOrders = mapProjectXOrders(orders, accountId);
      const rawFills = mapProjectXFills(fills, accountId);
      sampleTradeExecutionPayloads.push(...fills.slice(0, 1));

      if (!dryRun) {
        await upsertRawOrders(supabase, rawOrders);
        await upsertRawFills(supabase, rawFills);
      }

      allFills.push(...rawFills);
    }

    const normalizedTrades = await normalizeFillsToTrades(allFills, accountConfigs);

    if (dryRun) {
      return jsonResponse({
        ok: true,
        dryRun: true,
        rangeStart,
        rangeEnd,
        accountsDiscovered: accountIds.map(maskAccountId),
        accountsCount: accountIds.length,
        activeAccountsCount,
        ordersCount,
        tradeExecutionsCount: allFills.length,
        normalizedTradesCount: normalizedTrades.length,
        sampleAccountFields: sampleFieldNames(sampleAccountPayloads),
        sampleOrderFields: sampleFieldNames(sampleOrderPayloads),
        sampleTradeExecutionFields: sampleFieldNames(sampleTradeExecutionPayloads),
        mapping: {
          side: "0=buy, 1=sell",
          executionsSource: "/api/Trade/search",
          costs: "Trade/search fees + commissions -> trade commissions/costs",
        },
      });
    }

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
    const message = safeErrorMessage(error);
    const statusCode = error instanceof Error && error.name === "Unauthorized" ? 401 : 500;

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
    contract_name: stringOrNull(order.contractName ?? order.contractId ?? order.contract ?? order.symbol),
    status: stringOrNull(order.status),
    type: stringOrNull(order.type ?? order.orderType),
    side: mapSide(order.side ?? order.action),
    size: numberOrNull(order.size ?? order.quantity ?? order.qty),
    created_at_projectx: stringOrNull(order.creationTimestamp ?? order.createdAt ?? order.createdAtProjectX),
    filled_at_projectx: stringOrNull(order.updateTimestamp ?? order.filledAt ?? order.filledAtProjectX),
    trade_day: stringOrNull(order.tradeDay ?? order.tradeDate),
    execute_price: numberOrNull(order.executePrice ?? order.filledPrice ?? order.price),
    stop_price: numberOrNull(order.stopPrice),
    limit_price: numberOrNull(order.limitPrice),
    position_disposition: stringOrNull(order.positionDisposition),
    creation_disposition: stringOrNull(order.creationDisposition),
    rejection_reason: stringOrNull(order.rejectionReason),
    raw_payload: order,
  }));
}

async function fetchAllAccountsSafely(client: ProjectXClient, activeAccounts: Awaited<ReturnType<ProjectXClient["fetchAccounts"]>>) {
  try {
    const allAccounts = await client.fetchAccounts(false);
    return allAccounts.length > 0 ? allAccounts : activeAccounts;
  } catch {
    return activeAccounts;
  }
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code]
      .filter((part) => typeof part === "string" && part.length > 0);
    if (parts.length > 0) return parts.join(" | ");
    return JSON.stringify(record);
  }
  return "Unknown ProjectX sync error.";
}

function maskAccountId(accountId: string) {
  if (accountId.length <= 4) return `${accountId.slice(0, 1)}***`;
  return `${accountId.slice(0, 2)}***${accountId.slice(-2)}`;
}

function sampleFieldNames(payloads: Array<Record<string, unknown>> | undefined) {
  const sample = payloads?.find(Boolean);
  return sample ? Object.keys(sample).sort() : [];
}

function mapProjectXFills(fills: Record<string, unknown>[], fallbackAccountId: string): RawFillInsert[] {
  return fills.map((fill) => ({
    external_fill_id: stringOrNull(fill.id ?? fill.fillId ?? fill.externalFillId),
    external_order_id: stringOrNull(fill.orderId ?? fill.externalOrderId),
    external_account_id: String(fill.accountId ?? fill.externalAccountId ?? fallbackAccountId),
    contract_name: String(fill.contractName ?? fill.contractId ?? fill.contract ?? fill.symbol ?? ""),
    side: mapSide(fill.side ?? fill.action) ?? "",
    size: Number(fill.size ?? fill.quantity ?? fill.qty ?? 0),
    price: Number(fill.price ?? fill.fillPrice ?? 0),
    fill_time: String(fill.creationTimestamp ?? fill.fillTime ?? fill.timestamp ?? fill.createdAt ?? ""),
    // ProjectX Trade/search exposes realized profitAndLoss separately from costs.
    // Both fees and commissions are charged costs; using only fees overstated
    // account RP&L by the commission total.
    commission: totalExecutionCosts(fill),
    raw_payload: fill,
  }));
}

function totalExecutionCosts(fill: Record<string, unknown>) {
  const fees = numberOrNull(fill.fees) ?? 0;
  const commissions = numberOrNull(fill.commissions ?? fill.commission) ?? 0;
  const total = fees + commissions;
  return total === 0 ? null : total;
}

function stringOrNull(value: unknown) {
  return value === undefined || value === null ? null : String(value);
}

function numberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function mapSide(value: unknown) {
  if (value === 0 || value === "0") return "buy";
  if (value === 1 || value === "1") return "sell";
  if (value === undefined || value === null) return null;
  return String(value);
}
