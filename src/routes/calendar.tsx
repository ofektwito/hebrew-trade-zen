import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtMoney, pnlClass } from "@/lib/trade-utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAccountScope } from "@/components/AccountScope";
import { accountDisplayName, type JournalAccount } from "@/lib/accounts";

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
});

const DEFAULT_DAILY_LOSS_LIMIT = 350;
const dayNames = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

interface Trade {
  id: string;
  account_id: string | null;
  trade_date: string;
  instrument: string;
  direction: string;
  net_pnl: number | null;
  catalyst: string | null;
  setup_type: string | null;
}

interface Review {
  id: string;
  review_date: string;
  total_pnl: number | null;
  trades_count: number | null;
  main_catalyst: string | null;
  market_context: string | null;
  lessons: string | null;
  final_summary: string | null;
  reduce_size_tomorrow: boolean | null;
}

interface DayStats {
  date: string;
  day: number;
  inMonth: boolean;
  net: number;
  tradeCount: number;
  winRate: number;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
  catalyst: string | null;
  review: Review | null;
  lossLimitHit: boolean;
  status: "green" | "red" | "even" | "none" | "limit";
}

function CalendarPage() {
  const { selectedAccountId, selectedAccount, isAllAccounts, accounts, activeAccounts, scopedAccountIds, includeArchivedAccounts } = useAccountScope();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [trades, setTrades] = useState<Trade[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [dailyLossLimit, setDailyLossLimit] = useState(DEFAULT_DAILY_LOSS_LIMIT);
  const [loading, setLoading] = useState(true);

  const monthStart = toISODate(month);
  const monthEnd = toISODate(endOfMonth(month));

  useEffect(() => {
    (async () => {
      setLoading(true);
      let tradeQuery = supabase
          .from("trades")
          .select("id,account_id,trade_date,instrument,direction,net_pnl,catalyst,setup_type")
          .is("superseded_by", null)
          .gte("trade_date", monthStart)
          .lte("trade_date", monthEnd)
          .order("trade_date", { ascending: true });
      if (scopedAccountIds !== null) {
        if (scopedAccountIds.length === 0) {
          setTrades([]);
          setReviews([]);
          setLoading(false);
          return;
        }
        tradeQuery = tradeQuery.in("account_id", scopedAccountIds);
      }

      const [{ data: tradeRows }, { data: reviewRows }] = await Promise.all([
        tradeQuery,
        supabase
          .from("daily_reviews")
          .select("id,review_date,total_pnl,trades_count,main_catalyst,market_context,lessons,final_summary,reduce_size_tomorrow")
          .gte("review_date", monthStart)
          .lte("review_date", monthEnd)
          .order("review_date", { ascending: true }),
      ]);
      setTrades((tradeRows ?? []) as Trade[]);
      setReviews((reviewRows ?? []) as Review[]);
      setDailyLossLimit(Number(selectedAccount?.daily_loss_limit ?? DEFAULT_DAILY_LOSS_LIMIT));
      setLoading(false);
    })();
  }, [monthStart, monthEnd, selectedAccountId, selectedAccount?.daily_loss_limit, scopedAccountIds]);

  const visibleAccounts = selectedAccountId === "all-active" ? activeAccounts : accounts;
  const { days, summary } = useMemo(
    () => buildCalendar(month, trades, reviews, dailyLossLimit, visibleAccounts, isAllAccounts),
    [month, trades, reviews, dailyLossLimit, visibleAccounts, isAllAccounts],
  );

  function goMonth(delta: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function onDayClick(day: DayStats) {
    if (day.review) {
      navigate({ to: "/reviews/$reviewId", params: { reviewId: day.review.id } });
      return;
    }
    if (day.tradeCount > 0) {
      navigate({ to: "/reviews/new", search: { date: day.date } });
    }
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">לוח שנה P&L</h1>
          <p className="text-xs text-muted-foreground">{formatMonthTitle(month)} · {isAllAccounts ? "כל החשבונות" : accountDisplayName(selectedAccount)}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="ghost" onClick={() => goMonth(-1)} aria-label="חודש קודם">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" onClick={() => goMonth(1)} aria-label="חודש הבא">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <MonthlySummary summary={summary} />

      {!loading && trades.length === 0 && (
        <Card className="p-6 text-center gradient-card">
          <p className="text-sm text-muted-foreground mb-3">אין עדיין עסקאות בחודש הזה</p>
          <Link to="/trades">
            <Button>
              עבור לעסקאות
            </Button>
          </Link>
        </Card>
      )}

      <Card className="p-3 gradient-card">
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-muted-foreground">
          {dayNames.map((day) => (
            <div key={day} className="py-1">
              {day}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">טוען לוח שנה...</div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => (
              <button
                key={day.date}
                type="button"
                onClick={() => onDayClick(day)}
                disabled={!day.review && day.tradeCount === 0}
                className={`min-h-[74px] min-w-0 rounded-lg border p-1 text-right transition-colors sm:min-h-[84px] sm:p-1.5 ${dayClass(day)} ${
                  day.inMonth ? "" : "opacity-35"
                } ${day.review || day.tradeCount > 0 ? "hover:border-primary/80" : "cursor-default"}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-xs font-bold text-foreground">{day.day}</span>
                  {day.lossLimitHit && <span className="max-w-[52px] truncate rounded bg-warning/20 px-1 text-[9px] font-bold text-warning sm:max-w-none">סטופ יומי</span>}
                </div>

                <div className="mt-1 space-y-1">
                  <div className={`truncate text-[10px] font-bold leading-none sm:text-[11px] ${pnlClass(day.net)}`}>{day.tradeCount ? fmtMoney(day.net) : "ללא מסחר"}</div>
                  {day.tradeCount > 0 && (
                    <>
                      <div className="text-[10px] text-muted-foreground">{day.tradeCount} עסקאות</div>
                      <div className="text-[10px] text-muted-foreground">{day.winRate.toFixed(0)}% Win</div>
                    </>
                  )}
                  {day.catalyst && (
                    <div className="truncate text-[10px] text-primary" title={day.catalyst}>
                      {day.catalyst}
                    </div>
                  )}
                  <div className="text-[9px] text-muted-foreground">{statusLabel(day)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function MonthlySummary({ summary }: { summary: ReturnType<typeof summarizeMonth> }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <SummaryCard label="Net חודשי" value={fmtMoney(summary.net)} pnl={summary.net} />
      <SummaryCard label="ימי מסחר" value={String(summary.tradingDays)} />
      <SummaryCard label="ימים ירוקים" value={String(summary.greenDays)} accent="profit" />
      <SummaryCard label="ימים אדומים" value={String(summary.redDays)} accent="loss" />
      <SummaryCard label="סה״כ עסקאות" value={String(summary.totalTrades)} />
      <SummaryCard label="Win Rate" value={`${summary.winRate.toFixed(0)}%`} />
      <SummaryCard label="היום החזק ביותר" value={summary.biggestWin ? `${summary.biggestWin.date} · ${fmtMoney(summary.biggestWin.net)}` : "—"} pnl={summary.biggestWin?.net ?? null} />
      <SummaryCard label="היום החלש ביותר" value={summary.biggestLoss ? `${summary.biggestLoss.date} · ${fmtMoney(summary.biggestLoss.net)}` : "—"} pnl={summary.biggestLoss?.net ?? null} />
    </div>
  );
}

function SummaryCard({ label, value, pnl, accent }: { label: string; value: string; pnl?: number | null; accent?: "profit" | "loss" }) {
  return (
    <Card className="p-3 gradient-card shadow-card">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold leading-tight ${pnl !== undefined ? pnlClass(pnl) : accent === "profit" ? "text-profit" : accent === "loss" ? "text-loss" : ""}`}>
        {value}
      </p>
    </Card>
  );
}

function buildCalendar(month: Date, trades: Trade[], reviews: Review[], dailyLossLimit: number, accounts: JournalAccount[], isAllAccounts: boolean) {
  const reviewsByDate = new Map(reviews.map((review) => [review.review_date, review]));
  const tradesByDate = groupTradesByDate(trades);
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  const gridEnd = new Date(last);
  gridEnd.setDate(last.getDate() + (6 - last.getDay()));

  const days: DayStats[] = [];
  for (let current = new Date(gridStart); current <= gridEnd; current.setDate(current.getDate() + 1)) {
    const date = toISODate(current);
    const dayTrades = tradesByDate.get(date) ?? [];
    const review = reviewsByDate.get(date) ?? null;
    const stats = summarizeDay(date, current.getDate(), current.getMonth() === month.getMonth(), dayTrades, review, dailyLossLimit, accounts, isAllAccounts);
    days.push(stats);
  }

  return {
    days,
    summary: summarizeMonth(
      Array.from(tradesByDate.values()).map((dayTrades) =>
        summarizeDay(
          dayTrades[0].trade_date,
          Number(dayTrades[0].trade_date.slice(8, 10)),
          true,
          dayTrades,
          reviewsByDate.get(dayTrades[0].trade_date) ?? null,
          dailyLossLimit,
          accounts,
          isAllAccounts,
        ),
      ),
    ),
  };
}

function summarizeDay(
  date: string,
  day: number,
  inMonth: boolean,
  trades: Trade[],
  review: Review | null,
  dailyLossLimit: number,
  accounts: JournalAccount[],
  isAllAccounts: boolean,
): DayStats {
  const net = trades.reduce((sum, trade) => sum + (trade.net_pnl ?? 0), 0);
  const winners = trades.filter((trade) => (trade.net_pnl ?? 0) > 0);
  const sorted = [...trades].sort((a, b) => (b.net_pnl ?? 0) - (a.net_pnl ?? 0));
  const lossLimitHit = isAllAccounts ? anyAccountHitDailyLimit(trades, accounts) : net <= -dailyLossLimit;
  const status = lossLimitHit ? "limit" : trades.length === 0 ? "none" : net > 0 ? "green" : net < 0 ? "red" : "even";

  return {
    date,
    day,
    inMonth,
    net,
    tradeCount: trades.length,
    winRate: trades.length ? (winners.length / trades.length) * 100 : 0,
    bestTrade: sorted[0] ?? null,
    worstTrade: sorted[sorted.length - 1] ?? null,
    catalyst: review?.main_catalyst || mostCommonCatalyst(trades),
    review,
    lossLimitHit,
    status,
  };
}

function anyAccountHitDailyLimit(trades: Trade[], accounts: JournalAccount[]) {
  const pnlByAccount = new Map<string, number>();
  for (const trade of trades) {
    if (!trade.account_id) continue;
    pnlByAccount.set(trade.account_id, (pnlByAccount.get(trade.account_id) ?? 0) + (trade.net_pnl ?? 0));
  }
  return [...pnlByAccount.entries()].some(([accountId, pnl]) => {
    const account = accounts.find((row) => row.id === accountId);
    const limit = Number(account?.daily_loss_limit ?? DEFAULT_DAILY_LOSS_LIMIT);
    return pnl <= -limit;
  });
}

function summarizeMonth(days: DayStats[]) {
  const tradingDays = days.filter((day) => day.tradeCount > 0);
  const net = tradingDays.reduce((sum, day) => sum + day.net, 0);
  const allTrades = tradingDays.reduce((sum, day) => sum + day.tradeCount, 0);
  const winningTrades = tradingDays.reduce((sum, day) => {
    const wins = day.winRate && day.tradeCount ? Math.round((day.winRate / 100) * day.tradeCount) : 0;
    return sum + wins;
  }, 0);
  const biggestWin = tradingDays.filter((day) => day.net > 0).sort((a, b) => b.net - a.net)[0] ?? null;
  const biggestLoss = tradingDays.filter((day) => day.net < 0).sort((a, b) => a.net - b.net)[0] ?? null;

  return {
    net,
    tradingDays: tradingDays.length,
    greenDays: tradingDays.filter((day) => day.net > 0).length,
    redDays: tradingDays.filter((day) => day.net < 0).length,
    totalTrades: allTrades,
    winRate: allTrades ? (winningTrades / allTrades) * 100 : 0,
    biggestWin,
    biggestLoss,
  };
}

function groupTradesByDate(trades: Trade[]) {
  const groups = new Map<string, Trade[]>();
  for (const trade of trades) {
    const group = groups.get(trade.trade_date) ?? [];
    group.push(trade);
    groups.set(trade.trade_date, group);
  }
  return groups;
}

function mostCommonCatalyst(trades: Trade[]) {
  const counts = new Map<string, number>();
  for (const trade of trades) {
    if (!trade.catalyst || trade.catalyst === "None") continue;
    counts.set(trade.catalyst, (counts.get(trade.catalyst) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function dayClass(day: DayStats) {
  if (day.status === "limit") return "border-warning/60 bg-warning/10";
  if (day.status === "green") return "border-profit/40 bg-profit/10";
  if (day.status === "red") return "border-loss/40 bg-loss/10";
  if (day.status === "even") return "border-border bg-muted/20";
  return "border-border/60 bg-background/35";
}

function statusLabel(day: DayStats) {
  if (day.status === "limit") return "Daily Loss Limit";
  if (day.status === "green") return "Green Day";
  if (day.status === "red") return "Red Day";
  if (day.status === "even") return "Break-even";
  return "No Trading";
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthTitle(date: Date) {
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(date);
}
