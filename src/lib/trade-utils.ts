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

export function buildDailyReviewChatGPT(
  review: any,
  trades: any[],
  screenshots?: { reviewScreenshots?: any[]; tradeScreenshots?: any[] },
): string {
  const didWell = review.what_i_did_well ?? review.did_well ?? "";
  const didWrong = review.what_i_did_wrong ?? review.did_wrong ?? "";
  const mainLesson = review.main_lesson ?? review.lessons ?? "";
  const reduceSize = review.should_reduce_size_tomorrow ?? review.reduce_size_tomorrow;
  const emotionalScore = review.emotional_control_score ?? review.emotional_score;
  const finalTakeaway = review.final_takeaway ?? review.final_summary ?? "";
  const totalNet = trades.reduce((sum, trade) => sum + (trade.net_pnl ?? 0), 0);
  const winningTrades = trades.filter((trade) => (trade.net_pnl ?? 0) > 0).length;
  const winRate = trades.length ? (winningTrades / trades.length) * 100 : 0;
  const reviewScreenshotRows = screenshots?.reviewScreenshots ?? [];
  const tradeScreenshotRows = screenshots?.tradeScreenshots ?? [];

  const lines = [
    `תאריך: ${review.review_date}`,
    `P&L יומי: ${fmtMoney(review.total_pnl ?? totalNet)}`,
    `מספר טריידים: ${review.trades_count ?? trades.length}`,
    `Win Rate: ${winRate.toFixed(0)}%`,
    `Catalyst מרכזי: ${review.main_catalyst ?? "—"}`,
    `מצב שוק: ${review.market_state ?? "—"}`,
    `הקשר שוק: ${review.market_context ?? "—"}`,
    ``,
    `צילומי מסך:`,
    `- גרף יומי: ${hasScreenshot(reviewScreenshotRows, "daily_chart")}`,
    `- P&L יומי: ${hasScreenshot(reviewScreenshotRows, "daily_pnl")}`,
    `- סימון עסקאות: ${hasScreenshot(reviewScreenshotRows, "trade_markup")}`,
    `- אחר: ${hasScreenshot(reviewScreenshotRows, "other")}`,
    ``,
    `עסקאות:`,
    ...(trades.length
      ? trades.flatMap((t, i) => {
          const tradeShots = tradeScreenshotRows.filter((screenshot) => screenshot.trade_id === t.id);
          return [
          `טרייד ${i + 1}:`,
          `- כיוון: ${t.direction ?? "—"}`,
          `- נכס: ${[t.instrument, t.contract_name].filter(Boolean).join(" / ") || "—"}`,
          `- כניסה: ${t.entry_time ?? "—"}`,
          `- יציאה: ${t.exit_time ?? "—"}`,
          `- גודל: ${t.position_size ?? "—"}`,
          `- מחיר כניסה: ${t.entry_price ?? "—"}`,
          `- מחיר יציאה: ${t.exit_price ?? "—"}`,
          `- נקודות: ${fmtPoints(t.points)}`,
          `- P&L: ${fmtMoney(t.net_pnl)}`,
          `- Setup: ${t.setup_type ?? "—"}`,
          `- טעות: ${t.mistake_type ?? "—"}`,
          `- עבדתי לפי התוכנית: ${t.followed_plan ?? "—"}`,
          `- לקח: ${t.lesson ?? "—"}`,
          `- צילומי טרייד:`,
          `  - כניסה: ${hasScreenshot(tradeShots, "entry")}`,
          `  - יציאה: ${hasScreenshot(tradeShots, "exit")}`,
          `  - אחרי הטרייד: ${hasScreenshot(tradeShots, "post_trade")}`,
          ``,
        ];
      })
      : [`אין טריידים מתועדים ביום הזה.`, ``]),
    ``,
    `סיכום יומי:`,
    `- סיכום היום: ${review.daily_summary ?? ""}`,
    `- מה עשיתי טוב: ${didWell}`,
    `- מה עשיתי לא טוב: ${didWrong}`,
    `- הלקח המרכזי: ${mainLesson}`,
    `- חוק למחר: ${review.rule_for_tomorrow ?? ""}`,
    `- האם להקטין גודל מחר: ${reduceSize ? "כן" : "לא"}`,
    `- האם פגעתי בסטופ יומי: ${review.daily_loss_limit_hit ? "כן" : "לא"}`,
    `- האם עשיתי Overtrade: ${review.overtraded ? "כן" : "לא"}`,
    `- ציון משמעת: ${review.discipline_score ?? "—"}/10`,
    `- ציון ביצוע: ${review.execution_score ?? "—"}/10`,
    `- ציון שליטה רגשית: ${emotionalScore ?? "—"}/10`,
    `- טייקאווי סופי: ${finalTakeaway}`,
    ``,
    `שאלות ל-ChatGPT:`,
    `1. אילו דפוסים אתה מזהה ביום המסחר הזה, ומה הדבר הכי חשוב לשפר מחר?`,
    `2. אילו טעויות או חוזקות השפיעו הכי הרבה על ה-P&L, ואיזה כלל פרקטי כדאי להוסיף?`,
  ];
  return lines.join("\n");
}

function hasScreenshot(screenshots: any[], type: string) {
  return screenshots.some((screenshot) => {
    const screenshotType = screenshot.screenshot_type ?? screenshot.kind;
    return screenshotType === type || (type === "post_trade" && screenshotType === "post");
  })
    ? "קיים"
    : "לא צורף";
}
