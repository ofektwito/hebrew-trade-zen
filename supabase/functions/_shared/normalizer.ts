export type RawFillRow = {
  external_fill_id: string | null;
  external_order_id: string | null;
  external_account_id: string;
  contract_name: string;
  side: string;
  size: number;
  price: number;
  fill_time: string;
  commission: number | null;
  raw_payload?: Record<string, unknown> | null;
};

export type AccountConfig = {
  external_account_id: string;
  account_id: string | null;
  commission_per_contract: number;
};

export type TradeExecution = {
  external_execution_id: string;
  external_order_id: string | null;
  account_id: string | null;
  external_account_id: string;
  contract_name: string;
  side: "buy" | "sell";
  execution_role: "entry" | "add" | "partial_exit" | "exit";
  size: number;
  price: number;
  executed_at: string;
  commissions: number;
  fees: number;
  raw_payload: Record<string, unknown> | null;
};

export type NormalizedTrade = {
  account_id: string | null;
  source: "projectx";
  external_source: "projectx";
  external_trade_id: string;
  external_account_id: string;
  sync_hash: string;
  synced_at: string;
  trade_date: string;
  entry_at: string;
  exit_at: string;
  entry_time: string;
  exit_time: string;
  instrument: string;
  contract_name: string;
  direction: "Long" | "Short";
  size: number;
  position_size: number;
  max_position_size: number;
  total_opened_size: number;
  entry_price: number;
  exit_price: number;
  points: number;
  gross_pnl: number;
  commissions: number;
  net_pnl: number;
  executions_count: number;
  executions: TradeExecution[];
};

type CurrentLifecycle = {
  account: AccountConfig | undefined;
  externalAccountId: string;
  contractName: string;
  direction: "Long" | "Short";
  positionSign: 1 | -1;
  netPosition: number;
  maxPositionSize: number;
  totalOpenedSize: number;
  entryQty: number;
  entryValue: number;
  exitQty: number;
  exitValue: number;
  commissions: number;
  grossPnl: number;
  firstExecutionId: string;
  lastExecutionId: string;
  entryTime: string;
  exitTime: string;
  executions: TradeExecution[];
};

const pointValues: Record<string, number> = {
  MNQ: 2,
  MES: 5,
  NQ: 20,
  ES: 50,
};

export async function normalizeFillsToTrades(
  fills: RawFillRow[],
  accountConfigs: AccountConfig[],
) {
  const accountsByExternalId = new Map(
    accountConfigs.map((account) => [account.external_account_id, account]),
  );
  const trades: NormalizedTrade[] = [];
  const groups = new Map<string, RawFillRow[]>();

  for (const fill of fills) {
    if (!fill.external_account_id || !fill.contract_name) continue;
    const key = `${fill.external_account_id}:${fill.contract_name}`;
    groups.set(key, [...(groups.get(key) ?? []), fill]);
  }

  for (const groupFills of groups.values()) {
    const sortedFills = [...groupFills].sort(compareFills);
    let lifecycle: CurrentLifecycle | null = null;

    for (const fill of sortedFills) {
      const side = normalizeSide(fill.side);
      if (!side || fill.size <= 0 || !fill.fill_time) continue;

      let remainingSize = fill.size;
      const sideSign = side === "buy" ? 1 : -1;
      const account = accountsByExternalId.get(fill.external_account_id);
      const executionId = executionIdFor(fill);
      const commission = fill.commission ?? 0;
      let commissionRemaining = commission;

      while (remainingSize > 0) {
        if (!lifecycle) {
          const openingSize = remainingSize;
          lifecycle = startLifecycle(fill, account, side, openingSize, commissionRemaining, executionId);
          remainingSize = 0;
          commissionRemaining = 0;
          continue;
        }

        const sameDirection = Math.sign(lifecycle.netPosition) === sideSign;
        if (sameDirection) {
          addExecution(lifecycle, fill, side, "add", remainingSize, commissionRemaining, executionId);
          lifecycle.netPosition += sideSign * remainingSize;
          lifecycle.maxPositionSize = Math.max(lifecycle.maxPositionSize, Math.abs(lifecycle.netPosition));
          lifecycle.totalOpenedSize += remainingSize;
          lifecycle.entryQty += remainingSize;
          lifecycle.entryValue += fill.price * remainingSize;
          lifecycle.commissions += commissionRemaining;
          lifecycle.lastExecutionId = executionId;
          remainingSize = 0;
          commissionRemaining = 0;
          continue;
        }

        const openSize = Math.abs(lifecycle.netPosition);
        const closingSize = Math.min(openSize, remainingSize);
        const role = closingSize === openSize ? "exit" : "partial_exit";
        const commissionSlice = prorate(commissionRemaining, closingSize, remainingSize);

        addExecution(lifecycle, fill, side, role, closingSize, commissionSlice, executionId);
        lifecycle.exitQty += closingSize;
        lifecycle.exitValue += fill.price * closingSize;
        lifecycle.commissions += commissionSlice;
        lifecycle.grossPnl += realizedPnl(lifecycle.direction, lifecycle.entryValue / lifecycle.entryQty, fill.price, closingSize, lifecycle.contractName);
        lifecycle.netPosition += sideSign * closingSize;
        lifecycle.lastExecutionId = executionId;
        lifecycle.exitTime = fill.fill_time;

        remainingSize -= closingSize;
        commissionRemaining -= commissionSlice;

        if (Math.abs(lifecycle.netPosition) < 0.000001) {
          trades.push(await finishLifecycle(lifecycle));
          lifecycle = null;
        }

        // One execution can flatten and flip the position. The remaining quantity starts a new lifecycle.
        if (!lifecycle && remainingSize > 0) {
          lifecycle = startLifecycle(fill, account, side, remainingSize, commissionRemaining, executionId);
          remainingSize = 0;
          commissionRemaining = 0;
        }
      }
    }
  }

  return trades;
}

function startLifecycle(
  fill: RawFillRow,
  account: AccountConfig | undefined,
  side: "buy" | "sell",
  size: number,
  commission: number,
  executionId: string,
): CurrentLifecycle {
  const direction = side === "buy" ? "Long" : "Short";
  const netPosition = side === "buy" ? size : -size;
  const lifecycle: CurrentLifecycle = {
    account,
    externalAccountId: fill.external_account_id,
    contractName: fill.contract_name,
    direction,
    positionSign: side === "buy" ? 1 : -1,
    netPosition,
    maxPositionSize: size,
    totalOpenedSize: size,
    entryQty: size,
    entryValue: fill.price * size,
    exitQty: 0,
    exitValue: 0,
    commissions: commission,
    grossPnl: 0,
    firstExecutionId: executionId,
    lastExecutionId: executionId,
    entryTime: fill.fill_time,
    exitTime: fill.fill_time,
    executions: [],
  };

  addExecution(lifecycle, fill, side, "entry", size, commission, executionId);
  return lifecycle;
}

function addExecution(
  lifecycle: CurrentLifecycle,
  fill: RawFillRow,
  side: "buy" | "sell",
  role: TradeExecution["execution_role"],
  size: number,
  commission: number,
  executionId: string,
) {
  lifecycle.executions.push({
    external_execution_id: executionIdFor(fill, role, size),
    external_order_id: fill.external_order_id,
    account_id: lifecycle.account?.account_id ?? null,
    external_account_id: fill.external_account_id,
    contract_name: fill.contract_name,
    side,
    execution_role: role,
    size: roundNumber(size),
    price: fill.price,
    executed_at: fill.fill_time,
    commissions: roundMoney(commission),
    fees: roundMoney(commission),
    raw_payload: fill.raw_payload ?? null,
  });
}

async function finishLifecycle(lifecycle: CurrentLifecycle): Promise<NormalizedTrade> {
  const avgEntryPrice = lifecycle.entryQty ? lifecycle.entryValue / lifecycle.entryQty : 0;
  const avgExitPrice = lifecycle.exitQty ? lifecycle.exitValue / lifecycle.exitQty : avgEntryPrice;
  const instrument = inferInstrument(lifecycle.contractName);
  const points = lifecycle.direction === "Long"
    ? avgExitPrice - avgEntryPrice
    : avgEntryPrice - avgExitPrice;
  const grossPnl = roundMoney(lifecycle.grossPnl);
  const fallbackCommission = (lifecycle.account?.commission_per_contract ?? 0) * lifecycle.totalOpenedSize * 2;
  const commissions = roundMoney(lifecycle.commissions || fallbackCommission);
  const netPnl = roundMoney(grossPnl - commissions);
  const externalTradeId =
    `projectx:${lifecycle.externalAccountId}:${lifecycle.contractName}:${lifecycle.firstExecutionId}:${lifecycle.lastExecutionId}`;
  const syncHash = await hashQuantitativeFields({
    entry_time: lifecycle.entryTime,
    exit_time: lifecycle.exitTime,
    direction: lifecycle.direction,
    size: lifecycle.maxPositionSize,
    total_opened_size: lifecycle.totalOpenedSize,
    entry_price: avgEntryPrice,
    exit_price: avgExitPrice,
    points,
    gross_pnl: grossPnl,
    commissions,
    net_pnl: netPnl,
    executions_count: lifecycle.executions.length,
  });

  return {
    account_id: lifecycle.account?.account_id ?? null,
    source: "projectx",
    external_source: "projectx",
    external_trade_id: externalTradeId,
    external_account_id: lifecycle.externalAccountId,
    sync_hash: syncHash,
    synced_at: new Date().toISOString(),
    trade_date: lifecycle.entryTime.slice(0, 10),
    entry_at: lifecycle.entryTime,
    exit_at: lifecycle.exitTime,
    entry_time: timePart(lifecycle.entryTime),
    exit_time: timePart(lifecycle.exitTime),
    instrument,
    contract_name: lifecycle.contractName,
    direction: lifecycle.direction,
    size: roundNumber(lifecycle.maxPositionSize),
    position_size: roundNumber(lifecycle.maxPositionSize),
    max_position_size: roundNumber(lifecycle.maxPositionSize),
    total_opened_size: roundNumber(lifecycle.totalOpenedSize),
    entry_price: roundNumber(avgEntryPrice),
    exit_price: roundNumber(avgExitPrice),
    points: roundNumber(points),
    gross_pnl: grossPnl,
    commissions,
    net_pnl: netPnl,
    executions_count: lifecycle.executions.length,
    executions: lifecycle.executions,
  };
}

function compareFills(a: RawFillRow, b: RawFillRow) {
  const timeDiff = new Date(a.fill_time).getTime() - new Date(b.fill_time).getTime();
  if (timeDiff !== 0) return timeDiff;
  return executionIdFor(a).localeCompare(executionIdFor(b));
}

function normalizeSide(side: string) {
  const value = side.toLowerCase();
  if (["buy", "bid", "long", "b"].includes(value)) return "buy";
  if (["sell", "ask", "short", "s"].includes(value)) return "sell";
  return null;
}

function inferInstrument(contractName: string) {
  const normalized = contractName.toUpperCase();
  if (normalized.includes("MNQ")) return "MNQ";
  if (normalized.includes("MES")) return "MES";
  if (normalized.includes("NQ")) return "NQ";
  if (normalized.includes("ES")) return "ES";
  return normalized.split(/[ ._-]/)[0] || contractName;
}

function realizedPnl(direction: "Long" | "Short", avgEntryPrice: number, exitPrice: number, size: number, contractName: string) {
  const instrument = inferInstrument(contractName);
  const pointValue = pointValues[instrument] ?? 0;
  const points = direction === "Long" ? exitPrice - avgEntryPrice : avgEntryPrice - exitPrice;
  return points * pointValue * size;
}

function prorate(total: number, partSize: number, originalRemaining: number) {
  if (!total || !originalRemaining) return 0;
  return (total * partSize) / originalRemaining;
}

function executionIdFor(fill: RawFillRow, role?: string, size?: number) {
  const base = fill.external_fill_id ?? fill.external_order_id ?? `${fill.fill_time}:${fill.side}:${fill.price}`;
  return role ? `${base}:${role}:${roundNumber(size ?? fill.size)}` : base;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundNumber(value: number) {
  return Math.round(value * 10000) / 10000;
}

function timePart(value: string) {
  return new Date(value).toISOString().slice(11, 19);
}

async function hashQuantitativeFields(fields: Record<string, unknown>) {
  const encoded = new TextEncoder().encode(JSON.stringify(fields));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
