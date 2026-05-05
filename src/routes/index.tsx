import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dateInputValueInTimeZone, formatDisplayDate, fmtMoney, isRuleViolation, pnlClass, todayISO } from "@/lib/trade-utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Trophy, Target, CalendarDays, Wallet, Award } from "lucide-react";
import { useAccountScope } from "@/components/AccountScope";
import { ALL_ACCOUNTS, accountDisplayName } from "@/lib/accounts";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

interface Trade {
  id: string;
  account_id: string | null;
  trade_date: string;
  instrument: string;
  direction: string;
  net_pnl: number | null;
  gross_pnl: number | null;
  commissions: number | null;
  trade_quality: string | null;
  followed_plan: string | null;
  mistake_type: string | null;
  setup_type: string | null;
}

function Dashboard() {
  const { accounts, selectedAccountId, selectedAccount, isAllAccounts } = useAccountScope();
  const [todayTrades, setTodayTrades] = useState<Trade[]>([]);
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [recent, setRecent] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const today = todayISO();
      let todayQuery = supabase.from("trades").select("*").is("superseded_by", null).eq("trade_date", today);
      let allQuery = supabase.from("trades").select("*").is("superseded_by", null).order("trade_date", { ascending: false });
      let recentQuery = supabase.from("trades").select("*").is("superseded_by", null).order("trade_date", { ascending: false }).order("created_at", { ascending: false }).limit(8);
      if (selectedAccountId !== ALL_ACCOUNTS) {
        todayQuery = todayQuery.eq("account_id", selectedAccountId);
        allQuery = allQuery.eq("account_id", selectedAccountId);
        recentQuery = recentQuery.eq("account_id", selectedAccountId);
      }
      const [{ data: todayData }, { data: allData }, { data: recentData }] = await Promise.all([
        todayQuery,
        allQuery,
        recentQuery,
      ]);
      setTodayTrades((todayData ?? []) as Trade[]);
      setAllTrades((allData ?? []) as Trade[]);
      setRecent((recentData ?? []) as Trade[]);
      setLoading(false);
    })();
  }, [selectedAccountId]);

  const todayNet = sumPnl(todayTrades);
  const monthTrades = allTrades.filter((trade) => trade.trade_date?.startsWith(currentMonthISO()));
  const monthNet = sumPnl(monthTrades);
  const accountNet = sumPnl(allTrades);
  const totalComm = allTrades.reduce((s, t) => s + (t.commissions ?? 0), 0);
  const wins = allTrades.filter((t) => (t.net_pnl ?? 0) > 0);
  const losses = allTrades.filter((t) => (t.net_pnl ?? 0) < 0);
  const winRate = allTrades.length ? (wins.length / allTrades.length) * 100 : 0;
  const avgWin = wins.length ? wins.reduce((s, t) => s + (t.net_pnl ?? 0), 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + (t.net_pnl ?? 0), 0) / losses.length : 0;
  const violations = todayTrades.filter(isRuleViolation).length;
  const qualityScores: Record<string, number> = { "A+": 10, A: 8, B: 6, C: 4, "Bad trade": 1 };
  const disciplineAvg = allTrades.length
    ? allTrades.reduce((s, t) => s + (qualityScores[t.trade_quality ?? ""] ?? 5), 0) / allTrades.length
    : 0;
  const dailyLossLimit = Number(selectedAccount?.daily_loss_limit ?? 350);
  const dailyLossUsed = todayNet < 0 && dailyLossLimit > 0 ? Math.min(100, Math.abs(todayNet) / dailyLossLimit * 100) : 0;
  const accountBreakdown = useMemo(() => buildAccountBreakdown(accounts, allTrades), [accounts, allTrades]);
  const accountDailyLossRows = useMemo(() => buildAccountDailyLossRows(accounts, todayTrades), [accounts, todayTrades]);

  const status = accountNet > 0 ? "green" : accountNet < 0 ? "red" : "even";

  return (
    <div className="space-y-4">
      {/* Hero status */}
      <Card className={`p-5 border-0 shadow-card ${
        status === "green" ? "gradient-profit glow-profit" : status === "red" ? "gradient-loss glow-loss" : "gradient-card"
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider opacity-80 text-white">P&L כללי</p>
            <p className="text-4xl font-extrabold mt-1 text-white">{fmtMoney(accountNet)}</p>
            <p className="text-sm mt-1 text-white/85">
              {isAllAccounts ? "מחושב מהיומן לפי כל החשבונות" : `מחושב עבור ${accountDisplayName(selectedAccount)}`}
            </p>
          </div>
          <div className="text-right text-white/90">
            <div className="text-xs">סה״כ עסקאות</div>
            <div className="text-2xl font-bold">{allTrades.length}</div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="P&L יומי" value={fmtMoney(todayNet)} pnl={todayNet} icon={<Target className="h-4 w-4" />} />
        <Stat label="P&L חודשי" value={fmtMoney(monthNet)} pnl={monthNet} icon={<CalendarDays className="h-4 w-4" />} />
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <button type="button" className="block w-full text-right">
            <Card className="overflow-hidden border-primary/25 bg-card shadow-card transition-colors hover:border-primary/60">
              <div className="border-b border-border bg-foreground px-4 py-3 text-background">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide opacity-80">Topstep</p>
                    <h2 className="text-2xl font-extrabold leading-tight">Certified Funded Trader</h2>
                  </div>
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Award className="h-7 w-7" />
                  </div>
                </div>
              </div>
              <div className="space-y-2 p-4 text-center">
                <p className="text-xs font-semibold text-muted-foreground">This certificate recognizes</p>
                <p className="text-3xl font-extrabold tracking-tight text-foreground">Ofek Twito</p>
                <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
                  On April 30, 2026, you passed the Trading Combine and officially became a Topstep Funded Trader.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Badge className="mt-1 border-primary/30 bg-primary/10 text-primary" variant="outline">
                    Funded Trader
                  </Badge>
                  <span className="mt-1 text-[11px] font-semibold text-muted-foreground">לחץ לצפייה בתעודה</span>
                </div>
              </div>
            </Card>
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[92vh] max-w-[95vw] overflow-auto border-border bg-background p-2 sm:max-w-5xl">
          <img
            src="/certified-funded-trader.svg"
            alt="Certified Funded Trader certificate for Ofek Twito"
            className="h-auto w-full rounded-md"
          />
        </DialogContent>
      </Dialog>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Win Rate" value={`${winRate.toFixed(0)}%`} icon={<Target className="h-4 w-4" />} accent="primary" />
        <Stat label="Total Trades" value={String(allTrades.length)} icon={<Wallet className="h-4 w-4" />} />
        <Stat label="רווח ממוצע" value={fmtMoney(avgWin)} pnl={avgWin || null} />
        <Stat label="הפסד ממוצע" value={fmtMoney(avgLoss)} pnl={avgLoss || null} />
        <Stat label="עמלות" value={fmtMoney(totalComm)} icon={<Minus className="h-4 w-4" />} />
        <Stat label="ציון משמעת" value={`${disciplineAvg.toFixed(1)}/10`} icon={<Trophy className="h-4 w-4" />} accent="primary" />
      </div>

      {isAllAccounts ? (
        <Card className="p-4 gradient-card border-border/60 shadow-card">
          <h2 className="text-sm font-bold text-primary">סטופ יומי לפי חשבון</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">במצב כל החשבונות לא משתמשים במגבלה אחת משותפת.</p>
          <div className="mt-3 space-y-2">
            {accountDailyLossRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">אין טריידים היום.</p>
            ) : accountDailyLossRows.map((row) => (
              <div key={row.account.id} className="rounded-lg bg-input/25 px-3 py-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">{accountDisplayName(row.account)}</span>
                  <span className={pnlClass(row.pnl)}>{fmtMoney(row.pnl)} / -{fmtMoney(row.limit)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${row.used >= 100 ? "bg-loss" : "bg-warning"}`} style={{ width: `${row.used}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="p-4 gradient-card border-border/60 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">התקדמות סטופ יומי</p>
              <p className={`mt-1 text-xl font-bold ${pnlClass(todayNet)}`}>{fmtMoney(todayNet)} / -{fmtMoney(dailyLossLimit)}</p>
            </div>
            <Badge variant={dailyLossUsed >= 100 ? "destructive" : "secondary"}>{dailyLossUsed.toFixed(0)}%</Badge>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${dailyLossUsed >= 100 ? "bg-loss" : "bg-warning"}`}
              style={{ width: `${dailyLossUsed}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">מגבלת הפסד יומית לפי החשבון הנבחר, עם fallback של $350 אם אין ערך.</p>
        </Card>
      )}

      {isAllAccounts && accountBreakdown.length > 0 && (
        <Card className="p-4 gradient-card border-border/60 shadow-card">
          <h2 className="mb-3 text-sm font-bold text-primary">פירוט לפי חשבון</h2>
          <div className="space-y-2">
            {accountBreakdown.map((row) => (
              <div key={row.account.id} className="flex items-center justify-between rounded-lg bg-input/25 px-3 py-2 text-sm">
                <div>
                  <div className="font-semibold">{accountDisplayName(row.account)}</div>
                  <div className="text-[11px] text-muted-foreground">{row.trades} טריידים</div>
                </div>
                <div className={`font-bold ${pnlClass(row.pnl)}`}>{fmtMoney(row.pnl)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {violations > 0 && (
        <Card className="p-3 bg-loss/10 border-loss/40 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-loss" />
          <span className="text-sm">
            <span className="font-bold text-loss">{violations}</span> חריגות מהתוכנית היום
          </span>
        </Card>
      )}

      {/* Recent trades */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-bold">עסקאות אחרונות</h2>
          <Link to="/trades" className="text-xs text-primary font-semibold">כל העסקאות</Link>
        </div>
        {loading ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">טוען נתונים...</Card>
        ) : recent.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">עדיין אין עסקאות מסונכרנות ביומן</p>
            <Link to="/trades" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              פתח את מסך העסקאות
            </Link>
          </Card>
        ) : (
          <div className="space-y-2">
            {recent.map((t) => <TradeRow key={t.id} t={t} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function sumPnl(trades: Trade[]) {
  return trades.reduce((sum, trade) => sum + (trade.net_pnl ?? 0), 0);
}

function currentMonthISO() {
  return dateInputValueInTimeZone(new Date()).slice(0, 7);
}

function buildAccountBreakdown(accounts: ReturnType<typeof useAccountScope>["accounts"], trades: Trade[]) {
  return accounts
    .map((account) => {
      const accountTrades = trades.filter((trade) => trade.account_id === account.id);
      return {
        account,
        trades: accountTrades.length,
        pnl: sumPnl(accountTrades),
      };
    })
    .filter((row) => row.trades > 0);
}

function buildAccountDailyLossRows(accounts: ReturnType<typeof useAccountScope>["accounts"], trades: Trade[]) {
  return accounts
    .map((account) => {
      const accountTrades = trades.filter((trade) => trade.account_id === account.id);
      const pnl = sumPnl(accountTrades);
      const limit = Number(account.daily_loss_limit ?? 350);
      const used = pnl < 0 && limit > 0 ? Math.min(100, Math.abs(pnl) / limit * 100) : 0;
      return { account, pnl, limit, used, trades: accountTrades.length };
    })
    .filter((row) => row.trades > 0);
}

function Stat({ label, value, pnl, icon, accent }: { label: string; value: string; pnl?: number | null; icon?: React.ReactNode; accent?: "primary" }) {
  return (
    <Card className="p-3 gradient-card border-border/60 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon && <span className={accent === "primary" ? "text-primary" : "text-muted-foreground"}>{icon}</span>}
      </div>
      <p className={`text-xl font-bold mt-1 ${pnl !== undefined ? pnlClass(pnl) : accent === "primary" ? "text-primary" : "text-foreground"}`}>
        {value}
      </p>
    </Card>
  );
}

function TradeRow({ t }: { t: Trade }) {
  const profit = (t.net_pnl ?? 0) > 0;
  return (
    <Link to="/trades/$tradeId" params={{ tradeId: t.id }}>
      <Card className="p-3 flex items-center justify-between hover:border-primary/50 transition-colors gradient-card">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-full grid place-items-center ${profit ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss"}`}>
            {profit ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          </div>
          <div>
            <div className="font-semibold text-sm">{t.instrument} <span className="text-muted-foreground font-normal">· {t.direction}</span></div>
            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
              <span>{formatDisplayDate(t.trade_date)}</span>
              {t.setup_type && <Badge variant="secondary" className="text-[10px] py-0 px-1.5">{t.setup_type}</Badge>}
              {isRuleViolation(t) && <Badge className="bg-loss/20 text-loss border-0 text-[10px] py-0 px-1.5">חריגה</Badge>}
            </div>
          </div>
        </div>
        <div className={`text-base font-bold ${pnlClass(t.net_pnl)}`}>{fmtMoney(t.net_pnl)}</div>
      </Card>
    </Link>
  );
}
