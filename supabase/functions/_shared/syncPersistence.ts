import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { NormalizedTrade, RawFillRow } from "./normalizer.ts";
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
  const payload = {
    id: "projectx",
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

  for (const account of accounts) {
    const externalAccountId = String(account.id);
    const { data: existing, error: selectError } = await supabase
      .from("accounts")
      .select("id")
      .eq("external_source", "projectx")
      .eq("external_account_id", externalAccountId)
      .maybeSingle();

    if (selectError) throw selectError;

    const payload = {
      name: account.name,
      account_name: account.name,
      broker: "projectx",
      external_source: "projectx",
      external_account_id: externalAccountId,
      starting_balance: account.balance ?? null,
      is_active: account.canTrade ?? true,
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
        commission_per_contract: 0,
      });
      continue;
    }

    const { data: inserted, error } = await supabase
      .from("accounts")
      .insert(payload)
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
  if (orders.length === 0) return;

  const ordersWithExternalId = orders.filter((order) => order.external_order_id);
  const ordersWithPlatformId = orders.filter((order) => !order.external_order_id && order.platform_order_id);

  if (ordersWithExternalId.length > 0) {
    const { error } = await supabase
      .from("projectx_raw_orders")
      .upsert(ordersWithExternalId, { onConflict: "external_order_id" });
    if (error) throw error;
  }

  if (ordersWithPlatformId.length > 0) {
    const { error } = await supabase
      .from("projectx_raw_orders")
      .upsert(ordersWithPlatformId, { onConflict: "platform_order_id" });
    if (error) throw error;
  }
}

export async function upsertRawFills(supabase: SupabaseClient, fills: RawFillInsert[]) {
  if (fills.length === 0) return;

  const fillsWithExternalId = fills.filter((fill) => fill.external_fill_id);
  if (fillsWithExternalId.length > 0) {
    const { error } = await supabase
      .from("projectx_raw_fills")
      .upsert(fillsWithExternalId, { onConflict: "external_fill_id" });
    if (error) throw error;
  }
}

export async function upsertNormalizedTrades(
  supabase: SupabaseClient,
  trades: NormalizedTrade[],
) {
  let upserted = 0;
  let duplicatesSkipped = 0;

  for (const trade of trades) {
    const { data: existing, error: selectError } = await supabase
      .from("trades")
      .select("id, sync_hash")
      .eq("external_source", "projectx")
      .eq("external_trade_id", trade.external_trade_id)
      .maybeSingle();

    if (selectError) throw selectError;

    if (existing?.sync_hash === trade.sync_hash) {
      duplicatesSkipped += 1;
      continue;
    }

    if (existing?.id) {
      const { error } = await supabase
        .from("trades")
        .update({
          account_id: trade.account_id,
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
          entry_price: trade.entry_price,
          exit_price: trade.exit_price,
          points: trade.points,
          gross_pnl: trade.gross_pnl,
          commissions: trade.commissions,
          net_pnl: trade.net_pnl,
        })
        .eq("id", existing.id);

      if (error) throw error;
      upserted += 1;
      continue;
    }

    const { error } = await supabase.from("trades").insert(trade);
    if (error) throw error;
    upserted += 1;
  }

  return { upserted, duplicatesSkipped };
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
      "external_fill_id, external_order_id, external_account_id, contract_name, side, size, price, fill_time, commission",
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
  }));
}
