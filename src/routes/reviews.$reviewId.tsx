import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtMoney, pnlClass, buildDailyReviewChatGPT } from "@/lib/trade-utils";
import { toast } from "sonner";
import { Copy, Trash2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/reviews/$reviewId")({
  component: ReviewDetails,
});

function ReviewDetails() {
  const { reviewId } = Route.useParams();
  const navigate = useNavigate();
  const [review, setReview] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: r } = await supabase.from("daily_reviews").select("*").eq("id", reviewId).maybeSingle();
      setReview(r);
      if (r) {
        const { data: t } = await supabase.from("trades").select("*").eq("trade_date", r.review_date).order("entry_time", { ascending: true });
        setTrades(t ?? []);
      }
      setLoading(false);
    })();
  }, [reviewId]);

  if (loading) return <div className="text-center text-muted-foreground py-8">טוען...</div>;
  if (!review) return <div className="text-center text-muted-foreground py-8">סיכום לא נמצא</div>;

  async function copyForChatGPT() {
    await navigator.clipboard.writeText(buildDailyReviewChatGPT(review, trades));
    toast.success("הועתק ל-Clipboard ✨");
  }
  async function onDelete() {
    if (!confirm("למחוק את הסיכום?")) return;
    await supabase.from("daily_reviews").delete().eq("id", reviewId);
    toast.success("נמחק");
    navigate({ to: "/reviews" });
  }

  const profit = (review.total_pnl ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{review.review_date}</h1>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/reviews" })}>
          <ArrowLeft className="h-4 w-4 ml-1 rotate-180" /> חזרה
        </Button>
      </div>

      <Card className={`p-5 border-0 shadow-card ${profit ? "gradient-profit glow-profit" : "gradient-loss glow-loss"}`}>
        <div className="text-white">
          <p className="text-xs uppercase tracking-wider opacity-80">P&L יומי</p>
          <p className="text-3xl font-extrabold">{fmtMoney(review.total_pnl)}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <Pill label="משמעת" value={`${review.discipline_score ?? "—"}/10`} />
            <Pill label="ביצוע" value={`${review.execution_score ?? "—"}/10`} />
            <Pill label="רגש" value={`${review.emotional_score ?? "—"}/10`} />
          </div>
        </div>
      </Card>

      <Button onClick={copyForChatGPT} className="w-full h-12 font-bold">
        <Copy className="h-4 w-4 ml-2" /> Copy for ChatGPT Review
      </Button>

      <Card className="p-4 gradient-card space-y-2">
        <h3 className="text-sm font-bold text-primary">היום</h3>
        <Row k="עסקאות" v={review.trades_count ?? trades.length} />
        <Row k="קטליסט" v={review.main_catalyst ?? "—"} />
        <Row k="הטובה ביותר" v={review.best_trade ?? "—"} />
        <Row k="הגרועה ביותר" v={review.worst_trade ?? "—"} />
        <Row k="להקטין סייז מחר?" v={review.reduce_size_tomorrow ? "כן ✓" : "לא"} />
      </Card>

      {review.market_context && <TextCard title="הקשר השוק" text={review.market_context} />}
      {review.did_well && <TextCard title="מה עשיתי טוב" text={review.did_well} />}
      {review.did_wrong && <TextCard title="מה עשיתי לא טוב" text={review.did_wrong} />}
      {review.lessons && <TextCard title="לקחים" text={review.lessons} />}
      {review.rule_for_tomorrow && <TextCard title="חוק למחר" text={review.rule_for_tomorrow} />}
      {review.final_summary && <TextCard title="סיכום סופי" text={review.final_summary} />}

      <Card className="p-4 gradient-card space-y-2">
        <h3 className="text-sm font-bold text-primary">עסקאות באותו יום ({trades.length})</h3>
        {trades.length === 0 && <p className="text-xs text-muted-foreground">אין עסקאות בתאריך זה</p>}
        {trades.map((t) => (
          <Link key={t.id} to="/trades/$tradeId" params={{ tradeId: t.id }}>
            <div className="flex items-center justify-between text-sm border-b border-border/40 last:border-0 py-2">
              <div>
                <span className="font-semibold">{t.instrument} {t.direction}</span>
                <span className="text-muted-foreground text-xs"> · {t.setup_type ?? "—"}</span>
              </div>
              <span className={`font-bold ${pnlClass(t.net_pnl)}`}>{fmtMoney(t.net_pnl)}</span>
            </div>
          </Link>
        ))}
      </Card>

      <Button variant="destructive" onClick={onDelete} className="w-full">
        <Trash2 className="h-4 w-4 ml-2" /> מחק סיכום
      </Button>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return <div className="bg-white/15 rounded-lg px-2 py-1.5"><div className="opacity-80">{label}</div><div className="font-bold">{value}</div></div>;
}
function Row({ k, v }: { k: string; v: any }) {
  return <div className="flex justify-between text-sm border-b border-border/40 last:border-0 pb-1.5 last:pb-0"><span className="text-muted-foreground">{k}</span><span className="font-semibold">{v}</span></div>;
}
function TextCard({ title, text }: { title: string; text: string }) {
  return <Card className="p-4 gradient-card"><h3 className="text-sm font-bold text-primary mb-1.5">{title}</h3><p className="text-sm whitespace-pre-wrap">{text}</p></Card>;
}
