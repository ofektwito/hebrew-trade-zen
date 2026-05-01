import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  INSTRUMENTS, ORDER_TYPES, CATALYSTS, MARKET_CONDITIONS, SETUP_TYPES,
  TRADE_QUALITIES, FOLLOWED_PLAN, MISTAKE_TYPES, EMOTIONAL_STATES,
  calcPoints, calcGrossPnl, fmtMoney, fmtPoints, todayISO, pnlClass,
} from "@/lib/trade-utils";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";

export const Route = createFileRoute("/trades/new")({
  component: AddTrade,
});

function AddTrade() {
  const navigate = useNavigate();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<{ entry?: File; exit?: File; post?: File }>({});

  const [f, setF] = useState<any>({
    trade_date: todayISO(),
    entry_time: "",
    exit_time: "",
    account_name: "",
    instrument: "MNQ",
    contract_name: "",
    direction: "Long",
    position_size: 1,
    entry_price: "",
    exit_price: "",
    stop_price: "",
    target_price: "",
    commissions: 1.24,
    order_type: "Market",
    catalyst: "None",
    market_condition: "Trending",
    setup_type: "Momentum",
    trade_quality: "B",
    followed_plan: "Yes",
    mistake_type: "None",
    emotional_state: "Calm",
    notes: "",
    lesson: "",
  });

  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const points = useMemo(() => {
    const e = parseFloat(f.entry_price);
    const x = parseFloat(f.exit_price);
    return calcPoints(f.direction, isNaN(e) ? null : e, isNaN(x) ? null : x);
  }, [f.entry_price, f.exit_price, f.direction]);

  const grossPnl = useMemo(() => {
    const size = parseFloat(f.position_size) || 1;
    return calcGrossPnl(f.instrument, points, size);
  }, [f.instrument, points, f.position_size]);

  const netPnl = useMemo(() => {
    if (grossPnl == null) return null;
    return grossPnl - (parseFloat(f.commissions) || 0);
  }, [grossPnl, f.commissions]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        trade_date: f.trade_date,
        entry_time: f.entry_time || null,
        exit_time: f.exit_time || null,
        account_name: f.account_name || null,
        instrument: f.instrument,
        contract_name: f.contract_name || null,
        direction: f.direction,
        position_size: parseFloat(f.position_size) || 1,
        entry_price: parseFloat(f.entry_price) || null,
        exit_price: parseFloat(f.exit_price) || null,
        stop_price: f.stop_price ? parseFloat(f.stop_price) : null,
        target_price: f.target_price ? parseFloat(f.target_price) : null,
        gross_pnl: grossPnl,
        commissions: parseFloat(f.commissions) || 0,
        net_pnl: netPnl,
        points: points,
        order_type: f.order_type,
        catalyst: f.catalyst,
        market_condition: f.market_condition,
        setup_type: f.setup_type,
        trade_quality: f.trade_quality,
        followed_plan: f.followed_plan,
        mistake_type: f.mistake_type,
        emotional_state: f.emotional_state,
        notes: f.notes || null,
        lesson: f.lesson || null,
      };

      const { data: inserted, error } = await supabase.from("trades").insert(payload).select("id").single();
      if (error) throw error;
      const tradeId = inserted.id;

      // upload screenshots
      const kinds: ("entry" | "exit" | "post")[] = ["entry", "exit", "post"];
      for (const kind of kinds) {
        const file = files[kind];
        if (!file) continue;
        const path = `${tradeId}/${kind}-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("screenshots").upload(path, file);
        if (upErr) { toast.error(`שגיאה בהעלאת צילום ${kind}: ${upErr.message}`); continue; }
        const { data: pub } = supabase.storage.from("screenshots").getPublicUrl(path);
        await supabase.from("screenshots").insert({ trade_id: tradeId, kind, url: pub.publicUrl });
      }

      toast.success("העסקה נשמרה ביומן");
      router.invalidate();
      navigate({ to: "/trades/$tradeId", params: { tradeId } });
    } catch (err: any) {
      toast.error(err.message ?? "שגיאה בשמירת העסקה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">עסקה חדשה</h1>
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}>
          <ArrowLeft className="h-4 w-4 ml-1 rotate-180" /> חזרה ליומן
        </Button>
      </div>

      {/* Live calc */}
      <Card className="p-3 gradient-card border-primary/30">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">נקודות</div>
            <div className={`font-bold ${pnlClass(points)}`}>{fmtPoints(points)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">Gross</div>
            <div className={`font-bold ${pnlClass(grossPnl)}`}>{fmtMoney(grossPnl)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">Net</div>
            <div className={`font-bold ${pnlClass(netPnl)}`}>{fmtMoney(netPnl)}</div>
          </div>
        </div>
      </Card>

      <Section title="זמן וחשבון">
        <Field label="תאריך"><Input type="date" value={f.trade_date} onChange={(e) => set("trade_date", e.target.value)} required /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="שעת כניסה"><Input type="time" value={f.entry_time} onChange={(e) => set("entry_time", e.target.value)} /></Field>
          <Field label="שעת יציאה"><Input type="time" value={f.exit_time} onChange={(e) => set("exit_time", e.target.value)} /></Field>
        </div>
        <Field label="חשבון מסחר"><Input value={f.account_name} onChange={(e) => set("account_name", e.target.value)} placeholder="Topstep 50K" /></Field>
      </Section>

      <Section title="נכס וכיוון">
        <div className="grid grid-cols-2 gap-2">
          <Field label="נכס">
            <Sel value={f.instrument} onChange={(v) => set("instrument", v)} options={[...INSTRUMENTS]} />
          </Field>
          <Field label="חוזה"><Input value={f.contract_name} onChange={(e) => set("contract_name", e.target.value)} placeholder="MNQH5" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="כיוון">
            <Sel value={f.direction} onChange={(v) => set("direction", v)} options={["Long", "Short"]} />
          </Field>
          <Field label="גודל פוזיציה"><Input type="number" step="1" value={f.position_size} onChange={(e) => set("position_size", e.target.value)} /></Field>
        </div>
      </Section>

      <Section title="מחירים ו-P&L">
        <div className="grid grid-cols-2 gap-2">
          <Field label="כניסה"><Input type="number" step="0.01" value={f.entry_price} onChange={(e) => set("entry_price", e.target.value)} required /></Field>
          <Field label="יציאה"><Input type="number" step="0.01" value={f.exit_price} onChange={(e) => set("exit_price", e.target.value)} required /></Field>
          <Field label="סטופ"><Input type="number" step="0.01" value={f.stop_price} onChange={(e) => set("stop_price", e.target.value)} /></Field>
          <Field label="טארגט"><Input type="number" step="0.01" value={f.target_price} onChange={(e) => set("target_price", e.target.value)} /></Field>
        </div>
        <Field label="עמלות ($)"><Input type="number" step="0.01" value={f.commissions} onChange={(e) => set("commissions", e.target.value)} /></Field>
        <Field label="סוג הוראה">
          <Sel value={f.order_type} onChange={(v) => set("order_type", v)} options={[...ORDER_TYPES]} />
        </Field>
      </Section>

      <Section title="הקשר שוק">
        <Field label="קטליסט">
          <Sel value={f.catalyst} onChange={(v) => set("catalyst", v)} options={[...CATALYSTS]} />
        </Field>
        <Field label="מצב שוק">
          <Sel value={f.market_condition} onChange={(v) => set("market_condition", v)} options={[...MARKET_CONDITIONS]} />
        </Field>
        <Field label="Setup">
          <Sel value={f.setup_type} onChange={(v) => set("setup_type", v)} options={[...SETUP_TYPES]} />
        </Field>
      </Section>

      <Section title="איכות וביצוע">
        <Field label="איכות עסקה">
          <Sel value={f.trade_quality} onChange={(v) => set("trade_quality", v)} options={[...TRADE_QUALITIES]} />
        </Field>
        <Field label="פעלתי לפי התוכנית?">
          <Sel value={f.followed_plan} onChange={(v) => set("followed_plan", v)} options={[...FOLLOWED_PLAN]} />
        </Field>
        <Field label="סוג טעות">
          <Sel value={f.mistake_type} onChange={(v) => set("mistake_type", v)} options={[...MISTAKE_TYPES]} />
        </Field>
        <Field label="מצב רגשי לפני הכניסה">
          <Sel value={f.emotional_state} onChange={(v) => set("emotional_state", v)} options={[...EMOTIONAL_STATES]} />
        </Field>
      </Section>

      <Section title="הערות ולקחים">
        <Field label="הערות עסקה"><Textarea rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        <Field label="לקח מהעסקה"><Textarea rows={2} value={f.lesson} onChange={(e) => set("lesson", e.target.value)} /></Field>
      </Section>

      <Section title="צילומי מסך">
        <Uploader label="כניסה" file={files.entry} onChange={(file) => setFiles((p) => ({ ...p, entry: file }))} />
        <Uploader label="יציאה" file={files.exit} onChange={(file) => setFiles((p) => ({ ...p, exit: file }))} />
        <Uploader label="אחרי העסקה" file={files.post} onChange={(file) => setFiles((p) => ({ ...p, post: file }))} />
      </Section>

      <Button type="submit" disabled={saving} className="w-full h-12 text-base font-bold">
        <Save className="h-4 w-4 ml-2" />
        {saving ? "שומר..." : "שמירת עסקה"}
      </Button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 space-y-3 gradient-card">
      <h3 className="text-sm font-bold text-primary">{title}</h3>
      {children}
    </Card>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
function Sel({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
function Uploader({ label, file, onChange }: { label: string; file?: File; onChange: (f?: File) => void }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <label className="mt-1 flex items-center justify-center h-20 rounded-lg border-2 border-dashed border-border bg-input/40 cursor-pointer hover:border-primary/60 transition-colors">
        <input type="file" accept="image/*" className="hidden" onChange={(e) => onChange(e.target.files?.[0])} />
        <span className="text-xs text-muted-foreground">{file ? file.name : "בחירת תמונה"}</span>
      </label>
    </div>
  );
}
