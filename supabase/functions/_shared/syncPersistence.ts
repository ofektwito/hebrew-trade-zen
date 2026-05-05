import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { NormalizedTrade, RawFillRow, TradeExecution } from "./normalizer.ts";
import type { ProjectXAccount } from "./projectxClient.ts";

export type RawOrderInsert = {
  external_order_id: string | null;
  external_account_id: string | null;
  platform_order_id: string | null;
  exchange_order_id: string | null;
  contract_name: string | null;
  status: string | null;
  type: string | null;
  side: string | null;
  size: number | null;
  created_at_projectx: string | null;
  filled_at_projectx: string | null;
  trade_day: string | null;
  execute_price: number | null;
  stop_price: number | null;
  limit_price: number | null;
  position_disposition: string | null;
  creation_disposition: string | null;
  rejection_reason: string | null;
  raw_payload: Record<string, unknown>;
};

export type RawFillInsert = RawFillRow & {
  raw_payload: Record<string, unknown>;
};

export async function updateSyncStatus(
  supabase: SupabaseClient,
  status: "ok" | "syncing" | "error",
  message: string | null,
) {
  const now = new Date().toISOString();
  const ownerUserId = await loadOwnerUserId(supabase);
  const payload = {
    id: "projectx",
    user_id: ownerUserId,
    status,
    last_attempt_at: now,
    last_success_at: status === "ok" ? now : undefined,
    message,
    is_reconnecting: status === "syncing",
    updated_at: now,
  };

  const { error } = await supabase.from("sync_status").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function loadAccountConfigs(supabase: SupabaseClient, accountIds: string[]) {
  if (accountIds.length === 0) return [];

  const { data, error } = await supabase
    .from("accounts")
    .select("id, external_account_id, commission_per_contract")
    .in("external_account_id", accountIds);

  if (error) throw error;

  return (data ?? []).map((account) => ({
    account_id: account.id as string,
    external_account_id: account.external_account_id as string,
    commission_per_contract: Number(account.commission_per_contract ?? 0),
  }));
}

export async function upsertProjectXAccounts(
  supabase: SupabaseClient,
  accounts: ProjectXAccount[],
) {
  const configs = [];
  const ownerUserId = await loadOwnerUserId(supabase);

  for (const account of accounts) {
    const externalAccountId = String(account.id);
    const { data: existing, error: selectError } = await supabase
      .from("accounts")
      .select("id, commission_per_contract")
      .eq("external_source", "projectx")
      .eq("external_account_id", externalAccountId)
      .maybeSingle();

    if (selectError) throw selectError;

    const payload = {
      name: account.name,
      user_id: ownerUserId,
      broker: "projectx",
      external_source: "projectx",
      external_account_id: externalAccountId,
      starting_balance: account.balance ?? null,
      sync_status: "ok",
      sync_error: null,
      last_synced_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const { error } = await supabase.from("accounts").update(payload).eq("id", existing.id);
      if (error) throw error;
      configs.push({
        account_id: existing.id as string,
        external_account_id: externalAccountId,
        commission_per_contract: Number(existing.commission_per_contract ?? 0),
      });
      continue;
    }

    const { data: inserted, error } = await supabase
      .from("accounts")
      .insert({ ...payload, account_name: account.name, is_active: true })
      .select("id")
      .single();

    if (error) throw error;
    configs.push({
      account_id: inserted.id as string,
      external_account_id: externalAccountId,
      commission_per_contract: 0,
    });
  }

  return configs;
}

export async function upsertRawOrders(supabase: SupabaseClient, orders: RawOrderInsert[]) {
  const ownerUserId = await loadOwnerUserId(supabase);
  for (const order of orders) {
    if (!order.external_order_id && !order.platform_order_id) continue;

    const query = supabase.from("projectx_raw_orders").select("id").limit(1);
    const { data: existing, error: selectError } = order.external_order_id
      ? await query.eq("external_order_id", order.external_order_id).maybeSingle()
      : await query.eq("platform_order_id", order.platform_order_id).maybeSingle();

    if (selectError) throw selectError;

    const payload = { ...order, user_id: ownerUserId };

    if (existing?.id) {
      const { error } = await supabase.from("projectx_raw_orders").update(payload).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("projectx_raw_orders").insert(payload);
      if (error) throw error;
    }
  }
}

export async function upsertRawFills(supabase: SupabaseClient, fills: RawFillInsert[]) {
  const ownerUserId = await loadOwnerUserId(supabase);
  for (const fill of fills) {
    if (!fill.external_fill_id) continue;

    const { data: existing, error: selectError } = await supabase
      .from("projectx_raw_fills")
      .select("id")
      .eq("external_fill_id", fill.external_fill_id)
      .maybeSingle();

    if (selectError) throw selectError;

    const payload = { ...fill, user_id: ownerUserId };

    if (existing?.id) {
      const { error } = await supabase.from("projectx_raw_fills").update(payload).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("projectx_raw_fills").insert(payload);
      if (error) throw error;
    }
  }
}

export async function upsertNormalizedTrades(
  supabase: SupabaseClient,
  trades: NormalizedTrade[],
) {
  let upserted = 0;
  let duplicatesSkipped = 0;
  const ownerUserId = await loadOwnerUserId(supabase);

  for (const trade of trades) {
    const { data: existing, error: selectError } = await supabase
      .from("trades")
      .select("id, sync_hash")
      .eq("external_source", "projectx")
      .eq("external_trade_id", trade.external_trade_id)
      .maybeSingle();

    if (selectError) throw selectError;

    if (existing?.sync_hash === trade.sync_hash) {
      await replaceTradeExecutions(supabase, existing.id as string, trade.executions);
      duplicatesSkipped += 1;
      continue;
    }

    if (existing?.id) {
      const { error } = await supabase
        .from("trades")
        .update({
          account_id: trade.account_id,
          user_id: ownerUserId,
          external_account_id: trade.external_account_id,
          sync_hash: trade.sync_hash,
          synced_at: trade.synced_at,
          trade_date: trade.trade_date,
          entry_at: trade.entry_at,
          exit_at: trade.exit_at,
          entry_time: trade.entry_time,
          exit_time: trade.exit_time,
          instrument: trade.instrument,
          contract_name: trade.contract_name,
          direction: trade.direction,
          size: trade.size,
          position_size: trade.position_size,
          max_position_size: trade.max_position_size,
          total_opened_size: trade.total_opened_size,
          entry_price: trade.entry_price,
          exit_price: trade.exit_price,
          points: trade.points,
          gross_pnl: trade.gross_pnl,
          commissions: trade.commissions,
          net_pnl: trade.net_pnl,
          executions_count: trade.executions_count,
        })
        .eq("id", existing.id);

      if (error) throw error;
      await replaceTradeExecutions(supabase, existing.id as string, trade.executions);
      upserted += 1;
      continue;
    }

    const { data: inserted, error } = await supabase
      .from("trades")
      .insert({ ...withoutExecutions(trade), user_id: ownerUserId })
      .select("id")
      .single();
    if (error) throw error;
    await replaceTradeExecutions(supabase, inserted.id as string, trade.executions);
    upserted += 1;
  }

  await preserveAndSupersedePairTrades(supabase, trades);

  return { upserted, duplicatesSkipped };
}

export async function loadOwnerUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from("app_owner")
    .select("user_id")
    .eq("id", true)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;
  return (data?.user_id as string | null | undefined) ?? null;
}

export async function loadRawFillsForDay(
  supabase: SupabaseClient,
  date: string,
): Promise<RawFillRow[]> {
  const rangeStart = `${date}T00:00:00.000Z`;
  const rangeEnd = `${date}T23:59:59.999Z`;
  const { data, error } = await supabase
    .from("projectx_raw_fills")
    .select(
      "external_fill_id, external_order_id, external_account_id, contract_name, side, size, price, fill_time, commission, raw_payload",
    )
    .gte("fill_time", rangeStart)
    .lte("fill_time", rangeEnd)
    .order("fill_time", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((fill) => ({
    external_fill_id: fill.external_fill_id,
    external_order_id: fill.external_order_id,
    external_account_id: fill.external_account_id,
    contract_name: fill.contract_name,
    side: fill.side,
    size: Number(fill.size),
    price: Number(fill.price),
    fill_time: fill.fill_time,
    commission: fill.commission === null ? null : Number(fill.commission),
    raw_payload: fill.raw_payload,
  }));
}

function withoutExecutions(trade: NormalizedTrade) {
  const { executions: _executions, ...payload } = trade;
  return payload;
}

async function replaceTradeExecutions(
  supabase: SupabaseClient,
  tradeId: string,
  executions: TradeExecution[],
) {
  const { error: deleteError } = await supabase.from("trade_executions").delete().eq("trade_id", tradeId);
  if (deleteError) throw deleteError;

  if (executions.length === 0) return;

  const payload = executions.map((execution) => ({
    ...execution,
    trade_id: tradeId,
  }));

  const { error } = await supabase.from("trade_executions").insert(payload);
  if (error) throw error;
}

async function preserveAndSupersedePairTrades(
  supabase: SupabaseClient,
  lifecycleTrades: NormalizedTrade[],
) {
  const groupedIds = new Set(lifecycleTrades.map((trade) => trade.external_trade_id));
  const dates = [...new Set(lifecycleTrades.map((trade) => trade.trade_date))];
  if (dates.length === 0) return;

  const { data: insertedTrades, error: groupedError } = await supabase
    .from("trades")
    .select("id, external_trade_id, external_account_id, contract_name, trade_date, entry_at, exit_at, setup_type, catalyst, catalyst_manual_override, market_condition, trade_quality, followed_plan, mistake_type, emotional_state, notes, lesson")
    .eq("external_source", "projectx")
    .in("external_trade_id", [...groupedIds]);
  if (groupedError) throw groupedError;

  const { data: oldTrades, error: oldError } = await supabase
    .from("trades")
    .select("id, external_trade_id, external_account_id, contract_name, trade_date, entry_at, exit_at, setup_type, catalyst, catalyst_manual_override, market_condition, trade_quality, followed_plan, mistake_type, emotional_state, notes, lesson")
    .eq("external_source", "projectx")
    .in("trade_date", dates)
    .is("superseded_by", null);
  if (oldError) throw oldError;

  const groupedRows = insertedTrades ?? [];
  for (const oldTrade of oldTrades ?? []) {
    if (!oldTrade.external_trade_id || groupedIds.has(oldTrade.external_trade_id)) continue;

    const replacement = groupedRows.find((candidate) =>
      candidate.id !== oldTrade.id &&
      candidate.external_account_id === oldTrade.external_account_id &&
      candidate.contract_name === oldTrade.contract_name &&
      candidate.trade_date === oldTrade.trade_date &&
      isInsideLifecycle(oldTrade.entry_at, oldTrade.exit_at, candidate.entry_at, candidate.exit_at)
    );
    if (!replacement?.id) continue;

    const qualitativePatch = mergeQualitativeFields(replacement, oldTrade);
    if (Object.keys(qualitativePatch).length > 0) {
      const { error } = await supabase.from("trades").update(qualitativePatch).eq("id", replacement.id);
      if (error) throw error;
    }

    const { error: screenshotError } = await supabase
      .from("screenshots")
      .update({ trade_id: replacement.id })
      .eq("trade_id", oldTrade.id);
    if (screenshotError) throw screenshotError;

    const { error: supersedeError } = await supabase
      .from("trades")
      .update({
        superseded_by: replacement.id,
        superseded_reason: "projectx_lifecycle_grouping",
        superseded_at: new Date().toISOString(),
      })
      .eq("id", oldTrade.id);
    if (supersedeError) throw supersedeError;
  }
}

function isInsideLifecycle(
  oldEntry: string | null,
  oldExit: string | null,
  lifecycleEntry: string | null,
  lifecycleExit: string | null,
) {
  if (!oldEntry || !oldExit || !lifecycleEntry || !lifecycleExit) return false;
  return new Date(oldEntry).getTime() >= new Date(lifecycleEntry).getTime() &&
    new Date(oldExit).getTime() <= new Date(lifecycleExit).getTime();
}

function mergeQualitativeFields(target: Record<string, unknown>, source: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  const fields = [
    "setup_type",
    "market_condition",
    "trade_quality",
    "followed_plan",
    "mistake_type",
    "emotional_state",
    "notes",
    "lesson",
  ];

  for (const field of fields) {
    if (!hasValue(target[field]) && hasValue(source[field])) patch[field] = source[field];
  }

  if (!hasValue(target.catalyst) && hasValue(source.catalyst)) {
    patch.catalyst = source.catalyst;
    patch.catalyst_manual_override = Boolean(source.catalyst_manual_override);
  }

  return patch;
}

function hasValue(value: unknown) {
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}
