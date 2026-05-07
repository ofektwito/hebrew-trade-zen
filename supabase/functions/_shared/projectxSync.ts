import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  ProjectXClient,
  readProjectXAccountIds,
  readProjectXConfig,
} from "./projectxClient.ts";
import { normalizeFillsToTrades, type AccountConfig, type RawFillRow } from "./normalizer.ts";
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
} from "./syncPersistence.ts";

export type SyncProjectXOptions = {
  rangeStart?: string;
  rangeEnd?: string;
  dryRun?: boolean;
  accountIds?: string[];
  requestId?: string;
};

export type SyncProjectXResult = {
  ok: true;
  dryRun?: boolean;
  rangeStart: string;
  rangeEnd: string;
  accountsSynced: number;
  accountsCount: number;
  activeAccountsCount: number | null;
  ordersCount: number;
  fillsCount: number;
  tradesUpserted: number;
  duplicatesSkipped: number;
  accountsDiscovered?: string[];
  normalizedTradesCount?: number;
  sampleAccountFields?: string[];
  sampleOrderFields?: string[];
  sampleTradeExecutionFields?: string[];
  mapping?: Record<string, string>;
};

export async function syncProjectX(
  supabase: SupabaseClient,
  options: SyncProjectXOptions = {},
): Promise<SyncProjectXResult> {
  const dryRun = options.dryRun === true;
  const requestId = options.requestId ?? crypto.randomUUID();
  let runId: string | null = null;

  try {
    logSync(requestId, "start", {
      dryRun,
      requestedAccounts: maskAccountIds(options.accountIds ?? []),
    });

    if (!dryRun) {
      await updateSyncStatus(supabase, "syncing", "מסנכרן...");
    }

    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setDate(defaultStart.getDate() - (dryRun ? 1 : 7));
    const rangeStart = options.rangeStart ?? defaultStart.toISOString();
    const rangeEnd = options.rangeEnd ?? now.toISOString();

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
    let accountIds = sanitizeAccountIds(options.accountIds);
    if (accountIds.length === 0) accountIds = readProjectXAccountIds();
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
      const activeAccounts = await client.fetchAccounts(true);
      activeAccountsCount = activeAccounts.length;
      const allAccounts = await fetchAllAccountsSafely(client, activeAccounts);
      const requestedAccounts = allAccounts.filter((account) => accountIds.includes(String(account.id)));
      sampleAccountPayloads.push(...requestedAccounts.slice(0, 1) as Array<Record<string, unknown>>);
      accountConfigs = !dryRun && requestedAccounts.length > 0
        ? await upsertProjectXAccounts(supabase, requestedAccounts)
        : await loadAccountConfigs(supabase, accountIds);
    }

    logSync(requestId, "accounts_resolved", {
      accountsCount: accountIds.length,
      activeAccountsCount,
      accounts: maskAccountIds(accountIds),
    });

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
      logSync(requestId, "account_synced", {
        account: maskAccountId(accountId),
        orders: orders.length,
        fills: fills.length,
      });
    }

    const normalizedTrades = await normalizeFillsToTrades(allFills, accountConfigs);

    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        rangeStart,
        rangeEnd,
        accountsSynced: accountIds.length,
        accountsCount: accountIds.length,
        activeAccountsCount,
        ordersCount,
        fillsCount: allFills.length,
        tradesUpserted: 0,
        duplicatesSkipped: 0,
        accountsDiscovered: maskAccountIds(accountIds),
        normalizedTradesCount: normalizedTrades.length,
        sampleAccountFields: sampleFieldNames(sampleAccountPayloads),
        sampleOrderFields: sampleFieldNames(sampleOrderPayloads),
        sampleTradeExecutionFields: sampleFieldNames(sampleTradeExecutionPayloads),
        mapping: {
          side: "0=buy, 1=sell",
          executionsSource: "/api/Trade/search",
          costs: "Trade/search fees + commissions -> trade commissions/costs",
        },
      };
    }

    const { upserted, duplicatesSkipped } = await upsertNormalizedTrades(supabase, normalizedTrades);

    if (runId) {
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
    }

    await updateSyncStatus(supabase, "ok", "עודכן עכשיו");
    logSync(requestId, "success", {
      accountsSynced: accountIds.length,
      ordersCount,
      fillsCount: allFills.length,
      tradesUpserted: upserted,
      duplicatesSkipped,
    });

    return {
      ok: true,
      rangeStart,
      rangeEnd,
      accountsSynced: accountIds.length,
      accountsCount: accountIds.length,
      activeAccountsCount,
      ordersCount,
      fillsCount: allFills.length,
      tradesUpserted: upserted,
      duplicatesSkipped,
    };
  } catch (error) {
    const message = safeErrorMessage(error);

    try {
      await updateSyncStatus(supabase, "error", message);
    } catch {
      // Keep the caller response safe even if status persistence fails.
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
        // The thrown error below remains the source of truth.
      }
    }

    logSync(requestId, "error", {
      errorName: error instanceof Error ? error.name : typeof error,
      message,
    });
    throw error;
  }
}

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
    commission: totalExecutionCosts(fill),
    raw_payload: fill,
  }));
}

async function fetchAllAccountsSafely(
  client: ProjectXClient,
  activeAccounts: Awaited<ReturnType<ProjectXClient["fetchAccounts"]>>,
) {
  try {
    const allAccounts = await client.fetchAccounts(false);
    return allAccounts.length > 0 ? allAccounts : activeAccounts;
  } catch {
    return activeAccounts;
  }
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

function maskAccountIds(accountIds: string[]) {
  return accountIds.map(maskAccountId);
}

function maskAccountId(accountId: string) {
  if (accountId.length <= 4) return `${accountId.slice(0, 1)}***`;
  return `${accountId.slice(0, 2)}***${accountId.slice(-2)}`;
}

function sanitizeAccountIds(accountIds: unknown) {
  if (!Array.isArray(accountIds)) return [];
  return [...new Set(
    accountIds
      .map((accountId) => String(accountId).trim())
      .filter((accountId) => /^\d+$/.test(accountId)),
  )];
}

function sampleFieldNames(payloads: Array<Record<string, unknown>> | undefined) {
  const sample = payloads?.find(Boolean);
  return sample ? Object.keys(sample).sort() : [];
}

function logSync(requestId: string, event: string, details: Record<string, unknown>) {
  console.log(JSON.stringify({
    scope: "projectx_sync",
    requestId,
    event,
    ...details,
  }));
}
