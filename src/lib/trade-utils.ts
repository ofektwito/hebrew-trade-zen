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
    `=== סיכום עסקה ל-ChatGPT ===`,
    `תאריך: ${trade.trade_date}  ${trade.entry_time ?? ""} → ${trade.exit_time ?? ""}`,
    `נכס: ${trade.instrument} ${trade.contract_name ?? ""}`,
    `כיוון: ${trade.direction}  גודל פוזיציה: ${trade.position_size}`,
    `כניסה: ${trade.entry_price}  יציאה: ${trade.exit_price}  Stop: ${trade.stop_price ?? "—"}  Target: ${trade.target_price ?? "—"}`,
    `נקודות: ${trade.points ?? "—"}   Gross: ${fmtMoney(trade.gross_pnl)}  עמלות: ${fmtMoney(trade.commissions)}  Net: ${fmtMoney(trade.net_pnl)}`,
    `סוג הוראה: ${trade.order_type ?? "—"}`,
    `Catalyst: ${trade.catalyst ?? "—"}   מצב שוק: ${trade.market_condition ?? "—"}`,
    `Setup: ${trade.setup_type ?? "—"}   איכות עסקה: ${trade.trade_quality ?? "—"}`,
    `עבדתי לפי התוכנית: ${trade.followed_plan ?? "—"}   טעות: ${trade.mistake_type ?? "—"}`,
    `מצב רגשי: ${trade.emotional_state ?? "—"}`,
    `הערות: ${trade.notes ?? ""}`,
    `לקח: ${trade.lesson ?? ""}`,
    ``,
    `נתח את העסקה בעברית: מה עשיתי טוב, מה דורש שיפור, והאם יש סימני אזהרה שחוזרים על עצמם?`,
  ];
  return lines.join("\n");
}

export function buildDailyReviewChatGPT(review: any, trades: any[]): string {
  const lines = [
    `=== סקירת מסחר יומית ל-ChatGPT ===`,
    `תאריך: ${review.review_date}`,
    `Net P&L יומי: ${fmtMoney(review.total_pnl)}`,
    `מספר עסקאות: ${review.trades_count ?? trades.length}`,
    `משמעת: ${review.discipline_score}/10  ביצוע: ${review.execution_score}/10  שליטה רגשית: ${review.emotional_score}/10`,
    `Catalyst מרכזי: ${review.main_catalyst ?? "—"}`,
    `הקשר שוק: ${review.market_context ?? "—"}`,
    ``,
    `--- עסקאות ---`,
    ...trades.map((t, i) => `${i + 1}) ${t.instrument} ${t.direction} x${t.position_size} | כניסה ${t.entry_price} → יציאה ${t.exit_price} | Net ${fmtMoney(t.net_pnl)} | Setup: ${t.setup_type ?? "—"} | טעות: ${t.mistake_type ?? "—"}`),
    ``,
    `מה עשיתי טוב: ${review.did_well ?? ""}`,
    `מה עשיתי לא טוב: ${review.did_wrong ?? ""}`,
    `לקחים: ${review.lessons ?? ""}`,
    `כלל למחר: ${review.rule_for_tomorrow ?? ""}`,
    `להקטין גודל פוזיציה מחר: ${review.reduce_size_tomorrow ? "כן" : "לא"}`,
    `סיכום סופי: ${review.final_summary ?? ""}`,
    ``,
    `שאלות ל-ChatGPT:`,
    `1. אילו דפוסים אתה מזהה בעסקאות היום?`,
    `2. אילו טעויות פגעו הכי הרבה ב-P&L?`,
    `3. אילו 1-2 כללים פרקטיים כדאי להוסיף למחר?`,
  ];
  return lines.join("\n");
}
