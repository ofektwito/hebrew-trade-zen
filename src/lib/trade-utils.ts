// Trading helpers

export const INSTRUMENT_POINT_VALUE: Record<string, number> = {
  MNQ: 2,
  NQ: 20,
  MES: 5,
  ES: 50,
};

export const INSTRUMENTS = ["MNQ", "MES", "NQ", "ES", "Other"] as const;
export const ORDER_TYPES = ["Market", "Limit", "Stop"] as const;
export const CATALYSTS = ["None", "ISM", "FOMC", "CPI", "PPI", "NFP", "GDP", "PCE", "Earnings", "Other"] as const;
export const MARKET_CONDITIONS = ["Trending", "Choppy", "News-driven", "Range", "Breakout", "Reversal"] as const;
export const SETUP_TYPES = ["Momentum", "Pullback", "Breakout", "Rejection", "Volume weakness", "VWAP reclaim", "EMA continuation", "Failed breakout", "Other"] as const;
export const TRADE_QUALITIES = ["A+", "A", "B", "C", "Bad trade"] as const;
export const FOLLOWED_PLAN = ["Yes", "Partially", "No"] as const;
export const MISTAKE_TYPES = ["None", "FOMO", "Revenge trade", "Overtrading", "Too much size", "Chasing", "Early entry", "Late exit", "Ignored catalyst", "Ignored VWAP", "Other"] as const;
export const EMOTIONAL_STATES = ["Calm", "Confident", "Fearful", "Greedy", "Frustrated", "Impulsive"] as const;

export function calcPoints(direction: string, entry?: number | null, exit?: number | null): number | null {
  if (entry == null || exit == null) return null;
  return direction === "Short" ? entry - exit : exit - entry;
}

export function calcGrossPnl(instrument: string, points: number | null, size: number): number | null {
  if (points == null) return null;
  const v = INSTRUMENT_POINT_VALUE[instrument];
  if (!v) return null;
  return points * v * size;
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function fmtPoints(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}`;
}

export function isRuleViolation(t: { mistake_type?: string | null; followed_plan?: string | null }): boolean {
  return (t.mistake_type != null && t.mistake_type !== "None" && t.mistake_type !== "") || t.followed_plan === "No";
}

export function pnlClass(n: number | null | undefined): string {
  if (n == null || n === 0) return "text-muted-foreground";
  return n > 0 ? "text-profit" : "text-loss";
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function buildChatGPTSummary(trade: any): string {
  const lines = [
    `=== Trade Summary ===`,
    `Date: ${trade.trade_date}  ${trade.entry_time ?? ""} → ${trade.exit_time ?? ""}`,
    `Instrument: ${trade.instrument} ${trade.contract_name ?? ""}`,
    `Direction: ${trade.direction}  Size: ${trade.position_size}`,
    `Entry: ${trade.entry_price}  Exit: ${trade.exit_price}  Stop: ${trade.stop_price ?? "—"}  Target: ${trade.target_price ?? "—"}`,
    `Points: ${trade.points ?? "—"}   Gross: ${fmtMoney(trade.gross_pnl)}  Comm: ${fmtMoney(trade.commissions)}  Net: ${fmtMoney(trade.net_pnl)}`,
    `Order Type: ${trade.order_type ?? "—"}`,
    `Catalyst: ${trade.catalyst ?? "—"}   Market: ${trade.market_condition ?? "—"}`,
    `Setup: ${trade.setup_type ?? "—"}   Quality: ${trade.trade_quality ?? "—"}`,
    `Followed Plan: ${trade.followed_plan ?? "—"}   Mistake: ${trade.mistake_type ?? "—"}`,
    `Emotion: ${trade.emotional_state ?? "—"}`,
    `Notes: ${trade.notes ?? ""}`,
    `Lesson: ${trade.lesson ?? ""}`,
    ``,
    `Please analyze this trade. What did I do well? What can I improve? Any red flags?`,
  ];
  return lines.join("\n");
}

export function buildDailyReviewChatGPT(review: any, trades: any[]): string {
  const lines = [
    `=== Daily Trading Review ===`,
    `Date: ${review.review_date}`,
    `Daily Net P&L: ${fmtMoney(review.total_pnl)}`,
    `Trades: ${review.trades_count ?? trades.length}`,
    `Discipline: ${review.discipline_score}/10  Execution: ${review.execution_score}/10  Emotion: ${review.emotional_score}/10`,
    `Main Catalyst: ${review.main_catalyst ?? "—"}`,
    `Market Context: ${review.market_context ?? "—"}`,
    ``,
    `--- Trades ---`,
    ...trades.map((t, i) => `${i + 1}) ${t.instrument} ${t.direction} x${t.position_size} | entry ${t.entry_price} → exit ${t.exit_price} | net ${fmtMoney(t.net_pnl)} | setup: ${t.setup_type ?? "—"} | mistake: ${t.mistake_type ?? "—"}`),
    ``,
    `What I did well: ${review.did_well ?? ""}`,
    `What I did wrong: ${review.did_wrong ?? ""}`,
    `Lessons: ${review.lessons ?? ""}`,
    `Rule for tomorrow: ${review.rule_for_tomorrow ?? ""}`,
    `Reduce size tomorrow: ${review.reduce_size_tomorrow ? "Yes" : "No"}`,
    `Final summary: ${review.final_summary ?? ""}`,
    ``,
    `Questions for ChatGPT:`,
    `1. What patterns do you see across these trades?`,
    `2. Which mistakes are most damaging to my P&L?`,
    `3. What 1-2 concrete rules should I add for tomorrow?`,
  ];
  return lines.join("\n");
}
