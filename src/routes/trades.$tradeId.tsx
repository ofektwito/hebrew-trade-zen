import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, fmtPoints, isRuleViolation, pnlClass, buildChatGPTSummary } from "@/lib/trade-utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, Copy, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/trades/$tradeId")({
  component: TradeDetails,
});

function TradeDetails() {
  const { tradeId } = Route.useParams();
  const navigate = useNavigate();
  const [trade, setTrade] = useState<any>(null);
  const [shots, setShots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: t }, { data: s }] = await Promise.all([
        supabase.from("trades").select("*").eq("id", tradeId).maybeSingle(),
        supabase.from("screenshots").select("*").eq("trade_id", tradeId),
      ]);
      setTrade(t);
      setShots(s ?? []);
      setLoading(false);
    })();
  }, [tradeId]);

  if (loading) return <div className="text-center text-muted-foreground py-8">טוען...</div>;
  if (!trade) return <div className="text-center text-muted-foreground py-8">העסקה לא נמצאה</div>;

  const profit = (trade.net_pnl ?? 0) > 0;
  const violation = isRuleViolation(trade);
  const pnlPerContract = trade.net_pnl != null && trade.position_size ? trade.net_pnl / trade.position_size : null;

  async function copySummary() {
    await navigator.clipboard.writeText(buildChatGPTSummary(trade));
    toast.success("הועתק ל-Clipboard ✨");
  }
  async function onDelete() {
    if (!confirm("למחוק את העסקה?")) return;
    const { error } = await supabase.from("trades").delete().eq("id", tradeId);
    if (error) return toast.error(error.message);
    toast.success("נמחקה");
    navigate({ to: "/" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">פרטי עסקה</h1>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}>
          <ArrowLeft className="h-4 w-4 ml-1 rotate-180" /> חזרה
        </Button>
      </div>

      <Card className={`p-5 border-0 shadow-card ${profit ? "gradient-profit glow-profit" : "gradient-loss glow-loss"}`}>
        <div className="text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider opacity-80">{profit ? "WIN" : "LOSS"}</p>
              <p className="text-3xl font-extrabold mt-1">{fmtMoney(trade.net_pnl)}</p>
            </div>
            <div className="text-right">
              <div className="text-xs opacity-80">נקודות</div>
              <div className="text-2xl font-bold">{fmtPoints(trade.points)}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="bg-white/15 rounded-full px-2 py-1">{trade.instrument}</span>
            <span className="bg-white/15 rounded-full px-2 py-1">{trade.direction}</span>
            <span className="bg-white/15 rounded-full px-2 py-1">x{trade.position_size}</span>
            {trade.setup_type && <span className="bg-white/15 rounded-full px-2 py-1">{trade.setup_type}</span>}
          </div>
        </div>
      </Card>

      {violation && (
        <Card className="p-3 bg-loss/10 border-loss/40 text-loss text-sm font-semibold flex items-center gap-2">
          ⚠ עסקה זו סווגה כ-Rule Violation
        </Card>
      )}

      <Card className="p-4 gradient-card space-y-2">
        <h3 className="text-sm font-bold text-primary">סיכום</h3>
        <Row k="Net P&L" v={fmtMoney(trade.net_pnl)} cls={pnlClass(trade.net_pnl)} />
        <Row k="Gross P&L" v={fmtMoney(trade.gross_pnl)} />
        <Row k="עמלות" v={fmtMoney(trade.commissions)} />
        <Row k="P&L לחוזה" v={fmtMoney(pnlPerContract)} cls={pnlClass(pnlPerContract)} />
        <Row k="פעל לפי תוכנית?" v={trade.followed_plan} />
      </Card>

      <Card className="p-4 gradient-card space-y-2">
        <h3 className="text-sm font-bold text-primary">פרטי ביצוע</h3>
        <Row k="תאריך" v={trade.trade_date} />
        <Row k="שעת כניסה" v={trade.entry_time ?? "—"} />
        <Row k="שעת יציאה" v={trade.exit_time ?? "—"} />
        <Row k="חשבון" v={trade.account_name ?? "—"} />
        <Row k="חוזה" v={trade.contract_name ?? "—"} />
        <Row k="סוג הוראה" v={trade.order_type ?? "—"} />
        <Row k="כניסה" v={trade.entry_price} />
        <Row k="יציאה" v={trade.exit_price} />
        <Row k="סטופ" v={trade.stop_price ?? "—"} />
        <Row k="טארגט" v={trade.target_price ?? "—"} />
      </Card>

      <Card className="p-4 gradient-card space-y-2">
        <h3 className="text-sm font-bold text-primary">הקשר וביצוע</h3>
        <Row k="קטליסט" v={trade.catalyst ?? "—"} />
        <Row k="תנאי שוק" v={trade.market_condition ?? "—"} />
        <Row k="סטאפ" v={trade.setup_type ?? "—"} />
        <Row k="איכות" v={<Badge variant="secondary">{trade.trade_quality ?? "—"}</Badge>} />
        <Row k="טעות" v={trade.mistake_type ?? "—"} />
        <Row k="רגש" v={trade.emotional_state ?? "—"} />
      </Card>

      {(trade.notes || trade.lesson) && (
        <Card className="p-4 gradient-card space-y-3">
          <h3 className="text-sm font-bold text-primary">הערות ולקח</h3>
          {trade.notes && <div><div className="text-xs text-muted-foreground mb-1">הערות</div><p className="text-sm whitespace-pre-wrap">{trade.notes}</p></div>}
          {trade.lesson && <div><div className="text-xs text-muted-foreground mb-1">לקח</div><p className="text-sm whitespace-pre-wrap">{trade.lesson}</p></div>}
        </Card>
      )}

      {shots.length > 0 && (
        <Card className="p-4 gradient-card space-y-3">
          <h3 className="text-sm font-bold text-primary">צילומי מסך</h3>
          <div className="grid grid-cols-1 gap-3">
            {shots.map((s) => (
              <div key={s.id}>
                <div className="text-xs text-muted-foreground mb-1">{s.kind}</div>
                <a href={s.url} target="_blank" rel="noreferrer">
                  <img src={s.url} alt={s.kind} className="rounded-lg border border-border w-full" />
                </a>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={copySummary} className="h-11"><Copy className="h-4 w-4 ml-2" /> העתק ל-ChatGPT</Button>
        <Button variant="destructive" onClick={onDelete} className="h-11"><Trash2 className="h-4 w-4 ml-2" /> מחק</Button>
      </div>
    </div>
  );
}

function Row({ k, v, cls }: { k: string; v: any; cls?: string }) {
  return (
    <div className="flex items-center justify-between text-sm border-b border-border/40 last:border-0 pb-1.5 last:pb-0">
      <span className="text-muted-foreground">{k}</span>
      <span className={`font-semibold ${cls ?? ""}`}>{v}</span>
    </div>
  );
}
