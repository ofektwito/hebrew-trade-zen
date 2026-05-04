import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScreenshotUploader } from "@/components/ScreenshotUploader";
import { fmtMoney, fmtPoints, pnlClass, buildDailyReviewChatGPT } from "@/lib/trade-utils";
import { toast } from "sonner";
import { Copy, Trash2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/reviews/$reviewId")({
  component: ReviewDetails,
});

const dailyReviewScreenshotTypes = [
  { key: "daily_chart", label: "גרף יומי" },
  { key: "daily_pnl", label: "P&L יומי" },
  { key: "trade_markup", label: "סימון עסקאות" },
  { key: "other", label: "אחר" },
] as const;

function ReviewDetails() {
  const { reviewId } = Route.useParams();
  const navigate = useNavigate();
  const [review, setReview] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [reviewScreenshots, setReviewScreenshots] = useState<any[]>([]);
  const [tradeScreenshots, setTradeScreenshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadReview();
  }, [reviewId]);

  async function loadReview() {
    setLoading(true);
    const { data: r } = await supabase.from("daily_reviews").select("*").eq("id", reviewId).maybeSingle();
    setReview(r);
    if (r) {
      const [{ data: t }, { data: reviewShots }] = await Promise.all([
        supabase.from("trades").select("*").is("superseded_by", null).eq("trade_date", r.review_date).order("entry_time", { ascending: true }),
        supabase.from("screenshots").select("*").eq("review_id", reviewId).order("created_at", { ascending: true }),
      ]);
      const dayTrades = t ?? [];
      setTrades(dayTrades);
      setReviewScreenshots(reviewShots ?? []);

      if (dayTrades.length > 0) {
        const { data: tradeShots } = await supabase
          .from("screenshots")
          .select("*")
          .in("trade_id", dayTrades.map((trade) => trade.id))
          .order("created_at", { ascending: true });
        setTradeScreenshots(tradeShots ?? []);
      } else {
        setTradeScreenshots([]);
      }
    }
    setLoading(false);
  }

  if (loading) return <div className="text-center text-muted-foreground py-8">טוען סקירה...</div>;
  if (!review) return <div className="text-center text-muted-foreground py-8">הסקירה לא נמצאה</div>;

  async function copyForChatGPT() {
    await navigator.clipboard.writeText(buildDailyReviewChatGPT(review, trades, { reviewScreenshots, tradeScreenshots }));
    toast.success("הועתק ל-Clipboard");
  }
  async function onDelete() {
    if (!confirm("למחוק את הסקירה?")) return;
    await supabase.from("daily_reviews").delete().eq("id", reviewId);
    toast.success("הסקירה נמחקה");
    navigate({ to: "/reviews" });
  }

  const didWell = review.what_i_did_well ?? review.did_well;
  const didWrong = review.what_i_did_wrong ?? review.did_wrong;
  const mainLesson = review.main_lesson ?? review.lessons;
  const reduceSize = review.should_reduce_size_tomorrow ?? review.reduce_size_tomorrow;
  const emotionalScore = review.emotional_control_score ?? review.emotional_score;
  const finalTakeaway = review.final_takeaway ?? review.final_summary;

  const stats = getDayStats(trades);
  const totalNet = review.total_pnl ?? stats.totalNet;
  const profit = totalNet > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{review.review_date}</h1>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/reviews" })}>
          <ArrowLeft className="h-4 w-4 ml-1 rotate-180" /> חזרה לסקירות
        </Button>
      </div>

      <Card className={`p-5 border-0 shadow-card ${profit ? "gradient-profit glow-profit" : "gradient-loss glow-loss"}`}>
        <div className="text-white">
          <p className="text-xs uppercase tracking-wider opacity-80">Net P&L יומי</p>
          <p className="text-3xl font-extrabold">{fmtMoney(totalNet)}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <Pill label="משמעת" value={`${review.discipline_score ?? "—"}/10`} />
            <Pill label="ביצוע" value={`${review.execution_score ?? "—"}/10`} />
            <Pill label="רגש" value={`${emotionalScore ?? "—"}/10`} />
          </div>
        </div>
      </Card>

      <Button onClick={copyForChatGPT} className="w-full h-12 font-bold">
        <Copy className="h-4 w-4 ml-2" /> העתק לניתוח ב-ChatGPT
      </Button>

      <Card className="p-4 gradient-card space-y-2">
        <h3 className="text-sm font-bold text-primary">סיכום היום</h3>
        <Row k="תאריך" v={review.review_date} />
        <Row k="Net P&L" v={fmtMoney(totalNet)} cls={pnlClass(totalNet)} />
        <Row k="Gross P&L" v={fmtMoney(stats.totalGross)} cls={pnlClass(stats.totalGross)} />
        <Row k="עמלות" v={fmtMoney(stats.totalCommissions)} />
        <Row k="מספר טריידים" v={review.trades_count ?? trades.length} />
        <Row k="Win Rate" v={`${stats.winRate.toFixed(0)}%`} />
        <Row k="הטרייד הטוב ביותר" v={formatTradeShort(stats.bestTrade) || review.best_trade || "—"} />
        <Row k="הטרייד החלש ביותר" v={formatTradeShort(stats.worstTrade) || review.worst_trade || "—"} />
        <Row k="Catalyst מרכזי" v={review.main_catalyst ?? stats.mainCatalyst ?? "—"} />
        <Row k="מצב שוק" v={review.market_state ?? "—"} />
        <Row k="להקטין גודל פוזיציה מחר?" v={reduceSize ? "כן" : "לא"} />
        <Row k="פגעתי בסטופ יומי?" v={review.daily_loss_limit_hit ? "כן" : "לא"} />
        <Row k="Overtrade?" v={review.overtraded ? "כן" : "לא"} />
      </Card>

      {review.daily_summary && <TextCard title="סיכום היום" text={review.daily_summary} />}
      {review.market_context && <TextCard title="הקשר שוק" text={review.market_context} />}
      {didWell && <TextCard title="מה עשיתי טוב" text={didWell} />}
      {didWrong && <TextCard title="מה עשיתי לא טוב" text={didWrong} />}
      {mainLesson && <TextCard title="הלקח המרכזי" text={mainLesson} />}
      {review.rule_for_tomorrow && <TextCard title="כלל למחר" text={review.rule_for_tomorrow} />}
      {finalTakeaway && <TextCard title="טייקאווי סופי מהיום" text={finalTakeaway} />}

      <ScreenshotUploader
        title="צילומי סקירה יומית"
        description="בחירת קובץ שומרת אותו מיד ב-Supabase. אין צורך בכפתור שמירה נוסף."
        owner={{ reviewId }}
        context="daily_review"
        slots={dailyReviewScreenshotTypes}
        onChanged={loadReview}
      />

      <Card className="p-4 gradient-card space-y-2">
        <h3 className="text-sm font-bold text-primary">טריידים באותו יום ({trades.length})</h3>
        {trades.length === 0 && <p className="text-xs text-muted-foreground">אין עסקאות בתאריך הזה</p>}
        <div className="space-y-3">
          {trades.map((t, index) => (
            <TradeReviewCard key={t.id} trade={t} index={index} />
          ))}
        </div>
      </Card>

      <Button variant="destructive" onClick={onDelete} className="w-full">
        <Trash2 className="h-4 w-4 ml-2" /> מחיקת סקירה
      </Button>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return <div className="bg-white/15 rounded-lg px-2 py-1.5"><div className="opacity-80">{label}</div><div className="font-bold">{value}</div></div>;
}
function Row({ k, v, cls }: { k: string; v: any; cls?: string }) {
  return <div className="flex justify-between gap-3 text-sm border-b border-border/40 last:border-0 pb-1.5 last:pb-0"><span className="text-muted-foreground shrink-0">{k}</span><span className={`font-semibold text-left ${cls ?? ""}`}>{v}</span></div>;
}
function TextCard({ title, text }: { title: string; text: string }) {
  return <Card className="p-4 gradient-card"><h3 className="text-sm font-bold text-primary mb-1.5">{title}</h3><p className="text-sm whitespace-pre-wrap">{text}</p></Card>;
}

function TradeReviewCard({ trade, index }: { trade: any; index: number }) {
  const title = `${trade.instrument}${trade.contract_name ? ` / ${trade.contract_name}` : ""}`;

  return (
    <Card className="p-3 bg-background/35 border-border/70">
      <Link to="/trades/$tradeId" params={{ tradeId: trade.id }} className="block">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">טרייד {index + 1}</Badge>
              <span className="font-bold text-sm">{trade.direction}</span>
            </div>
            <div className="mt-1 text-sm font-semibold">{title}</div>
            <div className="text-[11px] text-muted-foreground">{trade.entry_time ?? "—"} → {trade.exit_time ?? "—"}</div>
          </div>
          <div className={`text-lg font-bold ${pnlClass(trade.net_pnl)}`}>{fmtMoney(trade.net_pnl)}</div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <MiniStat label="גודל" value={trade.position_size ?? "—"} />
          <MiniStat label="נקודות" value={fmtPoints(trade.points)} valueClass={pnlClass(trade.points)} />
          <MiniStat label="מחיר כניסה" value={trade.entry_price ?? "—"} />
          <MiniStat label="מחיר יציאה" value={trade.exit_price ?? "—"} />
          <MiniStat label="Setup" value={trade.setup_type ?? "—"} />
          <MiniStat label="Catalyst" value={trade.catalyst ?? "—"} />
          <MiniStat label="טעות" value={trade.mistake_type ?? "—"} />
          <MiniStat label="עבודה לפי תוכנית" value={trade.followed_plan ?? "—"} />
        </div>

        {trade.lesson && (
          <div className="mt-3 rounded-md bg-input/35 p-2">
            <div className="text-[11px] text-muted-foreground">לקח</div>
            <p className="text-xs leading-relaxed">{trade.lesson}</p>
          </div>
        )}
      </Link>
    </Card>
  );
}

function MiniStat({ label, value, valueClass }: { label: string; value: any; valueClass?: string }) {
  return (
    <div className="rounded-md bg-input/30 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`font-semibold truncate ${valueClass ?? ""}`}>{value}</div>
    </div>
  );
}

function getDayStats(trades: any[]) {
  const totalNet = trades.reduce((sum, trade) => sum + (trade.net_pnl ?? 0), 0);
  const totalGross = trades.reduce((sum, trade) => sum + (trade.gross_pnl ?? 0), 0);
  const totalCommissions = trades.reduce((sum, trade) => sum + (trade.commissions ?? 0), 0);
  const wins = trades.filter((trade) => (trade.net_pnl ?? 0) > 0).length;
  const sorted = [...trades].sort((a, b) => (b.net_pnl ?? 0) - (a.net_pnl ?? 0));

  return {
    totalNet,
    totalGross,
    totalCommissions,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    bestTrade: sorted[0] ?? null,
    worstTrade: sorted[sorted.length - 1] ?? null,
    mainCatalyst: mostCommonCatalyst(trades),
  };
}

function formatTradeShort(trade: any) {
  if (!trade) return "";
  return `${trade.instrument} ${trade.direction} · ${fmtMoney(trade.net_pnl)}`;
}

function mostCommonCatalyst(trades: any[]) {
  const counts = new Map<string, number>();
  for (const trade of trades) {
    if (!trade.catalyst || trade.catalyst === "None") continue;
    counts.set(trade.catalyst, (counts.get(trade.catalyst) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
