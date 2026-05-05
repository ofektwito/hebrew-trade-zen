import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { fmtMoney, isRuleViolation, pnlClass } from "@/lib/trade-utils";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar, Cell, CartesianGrid } from "recharts";
import { useAccountScope } from "@/components/AccountScope";
import { ALL_ACCOUNTS, accountDisplayName } from "@/lib/accounts";

export const Route = createFileRoute("/analytics")({
  component: Analytics,
});

const DAILY_LOSS_LIMIT = 1000;

function Analytics() {
  const { accounts, selectedAccountId, selectedAccount, isAllAccounts, labelForAccount } = useAccountScope();
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let query = supabase
        .from("trades")
        .select("*")
        .is("superseded_by", null)
        .order("trade_date", { ascending: true });
      if (selectedAccountId !== ALL_ACCOUNTS) query = query.eq("account_id", selectedAccountId);
      const { data } = await query;
      setTrades(data ?? []);
      setLoading(false);
    })();
  }, [selectedAccountId]);

  const stats = useMemo(() => computeStats(trades, accounts, isAllAccounts, selectedAccount?.daily_loss_limit), [trades, accounts, isAllAccounts, selectedAccount?.daily_loss_limit]);

  if (loading) return <div className="text-center text-muted-foreground py-8">טוען ניתוח...</div>;
  if (trades.length === 0) return <Card className="p-8 text-center gradient-card text-muted-foreground">עדיין אין עסקאות לניתוח</Card>;

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h1 className="text-xl font-bold">ניתוח ביצועים</h1>
        <p className="mt-1 text-xs text-muted-foreground">{isAllAccounts ? "כל החשבונות" : labelForAccount(selectedAccountId)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="סה״כ Net" value={fmtMoney(stats.totalNet)} pnl={stats.totalNet} />
        <Stat label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} accent />
        <Stat label="רווח ממוצע" value={fmtMoney(stats.avgWin)} pnl={stats.avgWin || null} />
        <Stat label="הפסד ממוצע" value={fmtMoney(stats.avgLoss)} pnl={stats.avgLoss || null} />
        <Stat label="עסקאות" value={String(trades.length)} accent />
        <Stat label="ימים מתחת למגבלת הפסד" value={String(stats.dlLimitDays)} pnl={stats.dlLimitDays > 0 ? -1 : null} />
      </div>

      <ChartCard title="P&L מצטבר">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={stats.cumulative}>
            <CartesianGrid stroke="#ffffff10" />
            <XAxis dataKey="date" hide />
            <YAxis stroke="#888" fontSize={10} width={40} />
            <Tooltip contentStyle={{ background: "#1d2230", border: "1px solid #333", borderRadius: 8 }} />
            <Line type="monotone" dataKey="cum" stroke="hsl(45 90% 60%)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <BreakdownCard title="P&L לפי נכס" data={stats.byInstrument} />
      {isAllAccounts && <BreakdownCard title="P&L לפי חשבון" data={stats.byAccount} />}
      {isAllAccounts && <AccountMetricsCard data={stats.accountMetrics} />}
      <BreakdownCard title="P&L לפי Catalyst" data={stats.byCatalyst} />
      <BreakdownCard title="P&L לפי Setup" data={stats.bySetup} />
      <BreakdownCard title="P&L לפי טעות" data={stats.byMistake} />
      <BreakdownCard title="P&L לפי איכות" data={stats.byQuality} />

      <Card className="p-4 gradient-card space-y-2">
        <h3 className="text-sm font-bold text-primary">תוכנית מול ביצוע</h3>
        <Row k="ממוצע כשפעלתי לפי התוכנית" v={fmtMoney(stats.planFollowedAvg)} cls={pnlClass(stats.planFollowedAvg)} />
        <Row k="ממוצע כשחרגתי מהתוכנית" v={fmtMoney(stats.planNotAvg)} cls={pnlClass(stats.planNotAvg)} />
        <Row k="ה-Setup הטוב ביותר" v={stats.bestSetup ?? "—"} />
        <Row k="ה-Setup החלש ביותר" v={stats.worstSetup ?? "—"} />
        <Row k="הטעות הנפוצה ביותר" v={stats.mostCommonMistake ?? "—"} />
      </Card>
    </div>
  );
}

function computeStats(trades: any[], accounts: ReturnType<typeof useAccountScope>["accounts"], isAllAccounts: boolean, selectedDailyLossLimit?: number | null) {
  const wins = trades.filter((t) => (t.net_pnl ?? 0) > 0);
  const losses = trades.filter((t) => (t.net_pnl ?? 0) < 0);
  const totalNet = trades.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
  const avgWin = wins.length ? wins.reduce((s, t) => s + (t.net_pnl ?? 0), 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + (t.net_pnl ?? 0), 0) / losses.length : 0;

  // Cumulative by date
  const byDate: Record<string, number> = {};
  trades.forEach((t) => { byDate[t.trade_date] = (byDate[t.trade_date] ?? 0) + (t.net_pnl ?? 0); });
  const dates = Object.keys(byDate).sort();
  let cum = 0;
  const cumulative = dates.map((d) => ({ date: d, daily: byDate[d], cum: (cum += byDate[d]) }));
  const dlLimitDays = isAllAccounts
    ? dates.filter((date) => anyAccountHitLimitOnDate(trades, accounts, date)).length
    : dates.filter((d) => byDate[d] <= -Number(selectedDailyLossLimit ?? 350)).length;

  const group = (key: string) => {
    const m: Record<string, number> = {};
    trades.forEach((t) => {
      const k = t[key] ?? "—";
      m[k] = (m[k] ?? 0) + (t.net_pnl ?? 0);
    });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  const byInstrument = group("instrument");
  const byAccount = groupAccount(trades, accounts);
  const byCatalyst = group("catalyst");
  const bySetup = group("setup_type");
  const byMistake = group("mistake_type");
  const byQuality = group("trade_quality");

  const bestSetup = bySetup[0]?.name;
  const worstSetup = bySetup[bySetup.length - 1]?.name;

  const mistakeCounts: Record<string, number> = {};
  trades.forEach((t) => { if (t.mistake_type && t.mistake_type !== "None") mistakeCounts[t.mistake_type] = (mistakeCounts[t.mistake_type] ?? 0) + 1; });
  const mostCommonMistake = Object.entries(mistakeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  const yes = trades.filter((t) => t.followed_plan === "Yes");
  const no = trades.filter((t) => t.followed_plan === "No");
  const planFollowedAvg = yes.length ? yes.reduce((s, t) => s + (t.net_pnl ?? 0), 0) / yes.length : 0;
  const planNotAvg = no.length ? no.reduce((s, t) => s + (t.net_pnl ?? 0), 0) / no.length : 0;

  const accountMetrics = buildAccountMetrics(trades, accounts);

  return {
    totalNet, winRate, avgWin, avgLoss, cumulative, dlLimitDays,
    byInstrument, byAccount, byCatalyst, bySetup, byMistake, byQuality, accountMetrics,
    bestSetup, worstSetup, mostCommonMistake, planFollowedAvg, planNotAvg,
  };
}

function groupAccount(trades: any[], accounts: ReturnType<typeof useAccountScope>["accounts"]) {
  const m: Record<string, number> = {};
  trades.forEach((trade) => {
    const account = accounts.find((row) => row.id === trade.account_id);
    const key = accountDisplayName(account);
    m[key] = (m[key] ?? 0) + (trade.net_pnl ?? 0);
  });
  return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function buildAccountMetrics(trades: any[], accounts: ReturnType<typeof useAccountScope>["accounts"]) {
  return accounts.map((account) => {
    const rows = trades.filter((trade) => trade.account_id === account.id);
    const wins = rows.filter((trade) => (trade.net_pnl ?? 0) > 0);
    const losses = rows.filter((trade) => (trade.net_pnl ?? 0) < 0);
    return {
      name: accountDisplayName(account),
      pnl: rows.reduce((sum, trade) => sum + (trade.net_pnl ?? 0), 0),
      winRate: rows.length ? (wins.length / rows.length) * 100 : 0,
      avgWin: wins.length ? wins.reduce((sum, trade) => sum + (trade.net_pnl ?? 0), 0) / wins.length : 0,
      avgLoss: losses.length ? losses.reduce((sum, trade) => sum + (trade.net_pnl ?? 0), 0) / losses.length : 0,
      commissions: rows.reduce((sum, trade) => sum + (trade.commissions ?? 0), 0),
      trades: rows.length,
    };
  }).filter((row) => row.trades > 0);
}

function anyAccountHitLimitOnDate(trades: any[], accounts: ReturnType<typeof useAccountScope>["accounts"], date: string) {
  return accounts.some((account) => {
    const pnl = trades
      .filter((trade) => trade.account_id === account.id && trade.trade_date === date)
      .reduce((sum, trade) => sum + (trade.net_pnl ?? 0), 0);
    return pnl <= -Number(account.daily_loss_limit ?? 350);
  });
}

function Stat({ label, value, pnl, accent }: { label: string; value: string; pnl?: number | null; accent?: boolean }) {
  return (
    <Card className="p-3 gradient-card shadow-card">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold mt-1 ${pnl !== undefined ? pnlClass(pnl) : accent ? "text-primary" : ""}`}>{value}</p>
    </Card>
  );
}
function Row({ k, v, cls }: { k: string; v: any; cls?: string }) {
  return <div className="flex justify-between text-sm border-b border-border/40 last:border-0 pb-1.5 last:pb-0"><span className="text-muted-foreground">{k}</span><span className={`font-semibold ${cls ?? ""}`}>{v}</span></div>;
}
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card className="p-3 gradient-card"><h3 className="text-sm font-bold text-primary mb-2">{title}</h3>{children}</Card>;
}
function BreakdownCard({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  if (!data.length) return null;
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 28)}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8 }}>
          <CartesianGrid stroke="#ffffff10" horizontal={false} />
          <XAxis type="number" stroke="#888" fontSize={10} />
          <YAxis type="category" dataKey="name" stroke="#bbb" fontSize={11} width={90} />
          <Tooltip contentStyle={{ background: "#1d2230", border: "1px solid #333", borderRadius: 8 }} formatter={(v: any) => fmtMoney(v)} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value >= 0 ? "oklch(0.74 0.18 145)" : "oklch(0.65 0.23 25)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function AccountMetricsCard({ data }: { data: Array<{ name: string; pnl: number; winRate: number; avgWin: number; avgLoss: number; commissions: number; trades: number }> }) {
  if (!data.length) return null;
  return (
    <Card className="p-4 gradient-card space-y-2">
      <h3 className="text-sm font-bold text-primary">מדדי חשבונות</h3>
      {data.map((row) => (
        <div key={row.name} className="rounded-lg border border-border/60 bg-input/20 p-3 text-xs">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-bold text-sm">{row.name}</span>
            <span className={`font-bold ${pnlClass(row.pnl)}`}>{fmtMoney(row.pnl)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Row k="Win Rate" v={`${row.winRate.toFixed(0)}%`} />
            <Row k="טריידים" v={row.trades} />
            <Row k="רווח ממוצע" v={fmtMoney(row.avgWin)} cls={pnlClass(row.avgWin)} />
            <Row k="הפסד ממוצע" v={fmtMoney(row.avgLoss)} cls={pnlClass(row.avgLoss)} />
            <Row k="עמלות" v={fmtMoney(row.commissions)} />
          </div>
        </div>
      ))}
    </Card>
  );
}
