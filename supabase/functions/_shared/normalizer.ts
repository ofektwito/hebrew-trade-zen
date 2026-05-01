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
};

export type AccountConfig = {
  external_account_id: string;
  account_id: string | null;
  commission_per_contract: number;
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
  entry_price: number;
  exit_price: number;
  points: number;
  gross_pnl: number;
  commissions: number;
  net_pnl: number;
};

type OpenLot = {
  fillId: string;
  accountId: string;
  contractName: string;
  side: "buy" | "sell";
  remainingSize: number;
  price: number;
  fillTime: string;
  commission: number;
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
  const openLots = new Map<string, OpenLot[]>();
  const trades: NormalizedTrade[] = [];

  const sortedFills = [...fills].sort(
    (a, b) => new Date(a.fill_time).getTime() - new Date(b.fill_time).getTime(),
  );

  for (const fill of sortedFills) {
    const side = normalizeSide(fill.side);
    if (!side || fill.size <= 0) continue;

    const key = `${fill.external_account_id}:${fill.contract_name}`;
    const lots = openLots.get(key) ?? [];
    let remainingSize = fill.size;

    while (remainingSize > 0 && lots.length > 0 && lots[0].side !== side) {
      const lot = lots[0];
      const matchedSize = Math.min(remainingSize, lot.remainingSize);
      const direction = lot.side === "buy" ? "Long" : "Short";
      const entryPrice = lot.price;
      const exitPrice = fill.price;
      const points = direction === "Long" ? exitPrice - entryPrice : entryPrice - exitPrice;
      const instrument = inferInstrument(fill.contract_name);
      const pointValue = pointValues[instrument] ?? 0;
      const entryCommission = proportionalCommission(lot.commission, matchedSize, lot.remainingSize);
      const exitCommission = proportionalCommission(fill.commission ?? 0, matchedSize, fill.size);
      const account = accountsByExternalId.get(fill.external_account_id);
      const fallbackCommission = (account?.commission_per_contract ?? 0) * matchedSize * 2;
      const commissions = entryCommission + exitCommission || fallbackCommission;
      const grossPnl = roundMoney(points * pointValue * matchedSize);
      const netPnl = roundMoney(grossPnl - commissions);
      const externalTradeId = `projectx:${fill.external_account_id}:${lot.fillId}:${fill.external_fill_id ?? fill.external_order_id}:${fill.contract_name}:${matchedSize}`;
      const syncHash = await hashQuantitativeFields({
        entry_time: lot.fillTime,
        exit_time: fill.fill_time,
        direction,
        size: matchedSize,
        entry_price: entryPrice,
        exit_price: exitPrice,
        points,
        gross_pnl: grossPnl,
        commissions,
        net_pnl: netPnl,
      });

      trades.push({
        account_id: account?.account_id ?? null,
        source: "projectx",
        external_source: "projectx",
        external_trade_id: externalTradeId,
        external_account_id: fill.external_account_id,
        sync_hash: syncHash,
        synced_at: new Date().toISOString(),
        trade_date: fill.fill_time.slice(0, 10),
        entry_at: lot.fillTime,
        exit_at: fill.fill_time,
        entry_time: timePart(lot.fillTime),
        exit_time: timePart(fill.fill_time),
        instrument,
        contract_name: fill.contract_name,
        direction,
        size: matchedSize,
        position_size: matchedSize,
        entry_price: entryPrice,
        exit_price: exitPrice,
        points: roundNumber(points),
        gross_pnl: grossPnl,
        commissions: roundMoney(commissions),
        net_pnl: netPnl,
      });

      remainingSize -= matchedSize;
      lot.remainingSize -= matchedSize;
      if (lot.remainingSize <= 0) lots.shift();
    }

    if (remainingSize > 0) {
      lots.push({
        fillId: fill.external_fill_id ?? fill.external_order_id ?? crypto.randomUUID(),
        accountId: fill.external_account_id,
        contractName: fill.contract_name,
        side,
        remainingSize,
        price: fill.price,
        fillTime: fill.fill_time,
        commission: fill.commission ?? 0,
      });
    }

    openLots.set(key, lots);
  }

  return trades;
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

function proportionalCommission(total: number, matchedSize: number, originalSize: number) {
  if (!total || !originalSize) return 0;
  return (total * matchedSize) / originalSize;
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

