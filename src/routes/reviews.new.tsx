import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { todayISO, fmtMoney, pnlClass } from "@/lib/trade-utils";
import { toast } from "sonner";
import { Save } from "lucide-react";

const searchSchema = z.object({ date: z.string().optional() });

export const Route = createFileRoute("/reviews/new")({
  validateSearch: zodValidator(searchSchema),
  component: NewReview,
});

function NewReview() {
  const { date } = Route.useSearch();
  const navigate = useNavigate();
  const initial = date ?? todayISO();
  const [saving, setSaving] = useState(false);
  const [autoStats, setAutoStats] = useState({ count: 0, total: 0, best: "", worst: "" });

  const [f, setF] = useState<any>({
    review_date: initial,
    total_pnl: "",
    trades_count: "",
    best_trade: "",
    worst_trade: "",
    main_catalyst: "",
    market_context: "",
    did_well: "",
    did_wrong: "",
    lessons: "",
    rule_for_tomorrow: "",
    reduce_size_tomorrow: false,
    discipline_score: 7,
    execution_score: 7,
    emotional_score: 7,
    final_summary: "",
  });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      const { data: trades } = await supabase.from("trades").select("*").eq("trade_date", f.review_date);
      const t = trades ?? [];
      const total = t.reduce((s: number, x: any) => s + (x.net_pnl ?? 0), 0);
      const sorted = [...t].sort((a, b) => (b.net_pnl ?? 0) - (a.net_pnl ?? 0));
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      setAutoStats({
        count: t.length,
        total,
        best: best ? `${best.instrument} ${best.direction} ${fmtMoney(best.net_pnl)}` : "",
        worst: worst && worst !== best ? `${worst.instrument} ${worst.direction} ${fmtMoney(worst.net_pnl)}` : "",
      });
      setF((p: any) => ({
        ...p,
        total_pnl: total.toFixed(2),
        trades_count: String(t.length),
        best_trade: p.best_trade || (best ? `${best.instrument} ${best.direction} ${fmtMoney(best.net_pnl)}` : ""),
        worst_trade: p.worst_trade || (worst && worst !== best ? `${worst.instrument} ${worst.direction} ${fmtMoney(worst.net_pnl)}` : ""),
      }));
    })();
  }, [f.review_date]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        review_date: f.review_date,
        total_pnl: parseFloat(f.total_pnl) || 0,
        trades_count: parseInt(f.trades_count) || 0,
        best_trade: f.best_trade || null,
        worst_trade: f.worst_trade || null,
        main_catalyst: f.main_catalyst || null,
        market_context: f.market_context || null,
        did_well: f.did_well || null,
        did_wrong: f.did_wrong || null,
        lessons: f.lessons || null,
        rule_for_tomorrow: f.rule_for_tomorrow || null,
        reduce_size_tomorrow: f.reduce_size_tomorrow,
        discipline_score: f.discipline_score,
        execution_score: f.execution_score,
        emotional_score: f.emotional_score,
        final_summary: f.final_summary || null,
      };
      const { data, error } = await supabase
        .from("daily_reviews")
        .upsert(payload, { onConflict: "review_date" })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("הסקירה נשמרה");
      navigate({ to: "/reviews/$reviewId", params: { reviewId: data.id } });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 pb-4">
      <h1 className="text-xl font-bold">סקירה יומית</h1>

      <Card className="p-3 gradient-card border-primary/30">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">סה״כ עסקאות</div>
            <div className="font-bold">{autoStats.count}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">P&L יומי</div>
            <div className={`font-bold ${pnlClass(autoStats.total)}`}>{fmtMoney(autoStats.total)}</div>
          </div>
        </div>
      </Card>

      <Card className="p-4 gradient-card space-y-3">
        <Field label="תאריך"><Input type="date" value={f.review_date} onChange={(e) => set("review_date", e.target.value)} required /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Net P&L יומי"><Input type="number" step="0.01" value={f.total_pnl} onChange={(e) => set("total_pnl", e.target.value)} /></Field>
          <Field label="מספר עסקאות"><Input type="number" value={f.trades_count} onChange={(e) => set("trades_count", e.target.value)} /></Field>
        </div>
        <Field label="העסקה הטובה ביותר"><Input value={f.best_trade} onChange={(e) => set("best_trade", e.target.value)} /></Field>
        <Field label="העסקה הגרועה ביותר"><Input value={f.worst_trade} onChange={(e) => set("worst_trade", e.target.value)} /></Field>
      </Card>

      <Card className="p-4 gradient-card space-y-3">
        <h3 className="text-sm font-bold text-primary">שוק והקשר</h3>
        <Field label="Catalyst מרכזי היום"><Input value={f.main_catalyst} onChange={(e) => set("main_catalyst", e.target.value)} /></Field>
        <Field label="הקשר שוק"><Textarea rows={2} value={f.market_context} onChange={(e) => set("market_context", e.target.value)} /></Field>
      </Card>

      <Card className="p-4 gradient-card space-y-3">
        <h3 className="text-sm font-bold text-primary">רפלקציה</h3>
        <Field label="מה עשיתי טוב"><Textarea rows={2} value={f.did_well} onChange={(e) => set("did_well", e.target.value)} /></Field>
        <Field label="מה עשיתי לא טוב"><Textarea rows={2} value={f.did_wrong} onChange={(e) => set("did_wrong", e.target.value)} /></Field>
        <Field label="לקחים שלמדתי"><Textarea rows={2} value={f.lessons} onChange={(e) => set("lessons", e.target.value)} /></Field>
        <Field label="כלל אחד לשמירה מחר"><Textarea rows={2} value={f.rule_for_tomorrow} onChange={(e) => set("rule_for_tomorrow", e.target.value)} /></Field>
        <div className="flex items-center justify-between rounded-lg bg-input/40 px-3 py-2">
          <Label className="text-sm">להקטין גודל פוזיציה מחר?</Label>
          <Switch checked={f.reduce_size_tomorrow} onCheckedChange={(v) => set("reduce_size_tomorrow", v)} />
        </div>
      </Card>

      <Card className="p-4 gradient-card space-y-3">
        <h3 className="text-sm font-bold text-primary">ציונים (1-10)</h3>
        <ScoreField label="משמעת" value={f.discipline_score} onChange={(v) => set("discipline_score", v)} />
        <ScoreField label="ביצוע" value={f.execution_score} onChange={(v) => set("execution_score", v)} />
        <ScoreField label="שליטה רגשית" value={f.emotional_score} onChange={(v) => set("emotional_score", v)} />
      </Card>

      <Card className="p-4 gradient-card space-y-3">
        <Field label="סיכום סופי"><Textarea rows={3} value={f.final_summary} onChange={(e) => set("final_summary", e.target.value)} /></Field>
      </Card>

      <Button type="submit" disabled={saving} className="w-full h-12 text-base font-bold">
        <Save className="h-4 w-4 ml-2" />{saving ? "שומר..." : "שמירת סקירה"}
      </Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
function ScoreField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <Label className="text-xs">{label}</Label>
        <span className="text-sm font-bold text-primary">{value}/10</span>
      </div>
      <input type="range" min={1} max={10} value={value} onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full accent-primary" />
    </div>
  );
}
