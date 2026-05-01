import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, isRuleViolation, pnlClass, todayISO } from "@/lib/trade-utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Trophy, Target } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

interface Trade {
  id: string;
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
  const [trades, setTrades] = useState<Trade[]>([]);
  const [recent, setRecent] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const today = todayISO();
      const [{ data: todayData }, { data: recentData }] = await Promise.all([
        supabase.from("trades").select("*").eq("trade_date", today),
        supabase.from("trades").select("*").order("trade_date", { ascending: false }).order("created_at", { ascending: false }).limit(8),
      ]);
      setTrades((todayData ?? []) as Trade[]);
      setRecent((recentData ?? []) as Trade[]);
      setLoading(false);
    })();
  }, []);

  const totalNet = trades.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
  const totalComm = trades.reduce((s, t) => s + (t.commissions ?? 0), 0);
  const wins = trades.filter((t) => (t.net_pnl ?? 0) > 0);
  const losses = trades.filter((t) => (t.net_pnl ?? 0) < 0);
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
  const avgWin = wins.length ? wins.reduce((s, t) => s + (t.net_pnl ?? 0), 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + (t.net_pnl ?? 0), 0) / losses.length : 0;
  const violations = trades.filter(isRuleViolation).length;
  const qualityScores: Record<string, number> = { "A+": 10, A: 8, B: 6, C: 4, "Bad trade": 1 };
  const disciplineAvg = trades.length
    ? trades.reduce((s, t) => s + (qualityScores[t.trade_quality ?? ""] ?? 5), 0) / trades.length
    : 0;

  const status = totalNet > 0 ? "green" : totalNet < 0 ? "red" : "even";

  return (
    <div className="space-y-4">
      {/* Hero status */}
      <Card className={`p-5 border-0 shadow-card ${
        status === "green" ? "gradient-profit glow-profit" : status === "red" ? "gradient-loss glow-loss" : "gradient-card"
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider opacity-80 text-white">P&L יומי</p>
            <p className="text-4xl font-extrabold mt-1 text-white">{fmtMoney(totalNet)}</p>
            <p className="text-sm mt-1 text-white/85">
              {status === "green" ? "יום ירוק" : status === "red" ? "יום אדום" : "Break-even"}
            </p>
          </div>
          <div className="text-right text-white/90">
            <div className="text-xs">עסקאות היום</div>
            <div className="text-2xl font-bold">{trades.length}</div>
          </div>
        </div>
      </Card>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Win Rate" value={`${winRate.toFixed(0)}%`} icon={<Target className="h-4 w-4" />} accent="primary" />
        <Stat label="Net" value={fmtMoney(totalNet)} pnl={totalNet} />
        <Stat label="רווח ממוצע" value={fmtMoney(avgWin)} pnl={avgWin || null} />
        <Stat label="הפסד ממוצע" value={fmtMoney(avgLoss)} pnl={avgLoss || null} />
        <Stat label="עמלות" value={fmtMoney(totalComm)} icon={<Minus className="h-4 w-4" />} />
        <Stat label="ציון משמעת" value={`${disciplineAvg.toFixed(1)}/10`} icon={<Trophy className="h-4 w-4" />} accent="primary" />
      </div>

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
          <Link to="/trades/new" className="text-xs text-primary font-semibold">+ עסקה חדשה</Link>
        </div>
        {loading ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">טוען נתונים...</Card>
        ) : recent.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">עדיין אין עסקאות ביומן</p>
            <Link to="/trades/new" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              הוספת עסקה ראשונה
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
              <span>{t.trade_date}</span>
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
