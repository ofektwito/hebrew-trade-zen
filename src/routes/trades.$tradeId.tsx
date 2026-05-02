import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CATALYSTS,
  EMOTIONAL_STATES,
  FOLLOWED_PLAN,
  MARKET_CONDITIONS,
  MISTAKE_TYPES,
  SETUP_TYPES,
  TRADE_QUALITIES,
  buildChatGPTSummary,
  fmtMoney,
  fmtPoints,
  isRuleViolation,
  pnlClass,
} from "@/lib/trade-utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Copy, ImagePlus, Save, Trash2, X } from "lucide-react";

export const Route = createFileRoute("/trades/$tradeId")({
  component: TradeDetails,
});

const screenshotTypes = [
  { key: "entry", label: "כניסה" },
  { key: "exit", label: "יציאה" },
  { key: "post_trade", label: "אחרי הטרייד" },
  { key: "other", label: "אחר" },
] as const;

type ScreenshotType = (typeof screenshotTypes)[number]["key"];

type EnrichmentForm = {
  setup_type: string;
  catalyst: string;
  catalyst_manual_override: boolean;
  market_condition: string;
  trade_quality: string;
  followed_plan: string;
  mistake_type: string;
  emotional_state: string;
  notes: string;
  lesson: string;
};

type ScreenshotStatus = "idle" | "uploading" | "saved" | "error" | "deleting";

function TradeDetails() {
  const { tradeId } = Route.useParams();
  const navigate = useNavigate();
  const [trade, setTrade] = useState<any>(null);
  const [form, setForm] = useState<EnrichmentForm>(() => emptyForm());
  const [shots, setShots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [screenshotStatus, setScreenshotStatus] = useState<Record<ScreenshotType, ScreenshotStatus>>({
    entry: "idle",
    exit: "idle",
    post_trade: "idle",
    other: "idle",
  });

  useEffect(() => {
    void loadTrade();
  }, [tradeId]);

  async function loadTrade() {
    setLoading(true);
    const [{ data: t }, { data: s }] = await Promise.all([
      supabase.from("trades").select("*").eq("id", tradeId).maybeSingle(),
      supabase
        .from("screenshots")
        .select("*")
        .eq("trade_id", tradeId)
        .order("created_at", { ascending: true }),
    ]);
    setTrade(t);
    setForm(formFromTrade(t));
    setShots(s ?? []);
    setLoading(false);
  }

  const isProjectX = trade?.source === "projectx";
  const profit = (trade?.net_pnl ?? 0) > 0;
  const violation = trade ? isRuleViolation(trade) : false;
  const pnlPerContract = trade?.net_pnl != null && trade.position_size ? trade.net_pnl / trade.position_size : null;
  const screenshotsByType = useMemo(() => groupScreenshots(shots), [shots]);

  if (loading) return <div className="py-8 text-center text-muted-foreground">טוען עסקה...</div>;
  if (!trade) return <div className="py-8 text-center text-muted-foreground">העסקה לא נמצאה</div>;

  function set<K extends keyof EnrichmentForm>(key: K, value: EnrichmentForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function copySummary() {
    await navigator.clipboard.writeText(buildChatGPTSummary({ ...trade, ...form }));
    toast.success("הועתק ל-Clipboard");
  }

  async function saveEnrichment() {
    setSaving(true);
    const payload = {
      setup_type: valueOrNull(form.setup_type),
      catalyst: valueOrNull(form.catalyst),
      catalyst_manual_override: form.catalyst_manual_override,
      market_condition: valueOrNull(form.market_condition),
      trade_quality: valueOrNull(form.trade_quality),
      followed_plan: valueOrNull(form.followed_plan),
      mistake_type: valueOrNull(form.mistake_type),
      emotional_state: valueOrNull(form.emotional_state),
      notes: valueOrNull(form.notes),
      lesson: valueOrNull(form.lesson),
      is_manual_override: true,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("trades").update(payload).eq("id", tradeId);
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("היומן של הטרייד נשמר");
    await loadTrade();
  }

  async function uploadScreenshot(type: ScreenshotType, file?: File) {
    if (!file) return;
    setScreenshotStatus((current) => ({ ...current, [type]: "uploading" }));
    const path = `${tradeId}/${type}-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error: uploadError } = await supabase.storage.from("screenshots").upload(path, file);

    if (uploadError) {
      setScreenshotStatus((current) => ({ ...current, [type]: "error" }));
      toast.error(`שגיאה בהעלאת צילום: ${uploadError.message}`);
      return;
    }

    const { data: publicData } = supabase.storage.from("screenshots").getPublicUrl(path);
    const publicUrl = publicData.publicUrl;
    const { error: insertError } = await supabase.from("screenshots").insert({
      trade_id: tradeId,
      kind: type,
      screenshot_type: type,
      storage_path: path,
      url: publicUrl,
      public_url: publicUrl,
      uploaded_at: new Date().toISOString(),
    });

    if (insertError) {
      await supabase.storage.from("screenshots").remove([path]);
      setScreenshotStatus((current) => ({ ...current, [type]: "error" }));
      toast.error(insertError.message);
      return;
    }

    setScreenshotStatus((current) => ({ ...current, [type]: "saved" }));
    toast.success("צילום המסך נשמר");
    await loadTrade();
  }

  async function removeScreenshot(screenshot: any) {
    const type = normalizeScreenshotType(screenshot.screenshot_type ?? screenshot.kind);
    setScreenshotStatus((current) => ({ ...current, [type]: "deleting" }));
    const storagePath = screenshot.storage_path;
    if (storagePath) {
      const { error: removeError } = await supabase.storage.from("screenshots").remove([storagePath]);
      if (removeError) {
        setScreenshotStatus((current) => ({ ...current, [type]: "error" }));
        toast.error(`שגיאה במחיקת צילום: ${removeError.message}`);
        return;
      }
    }

    const { error } = await supabase.from("screenshots").delete().eq("id", screenshot.id);
    if (error) {
      setScreenshotStatus((current) => ({ ...current, [type]: "error" }));
      toast.error(error.message);
      return;
    }

    setScreenshotStatus((current) => ({ ...current, [type]: "idle" }));
    toast.success("צילום המסך הוסר");
    await loadTrade();
  }

  async function onDelete() {
    if (isProjectX) {
      toast.error("טרייד שסונכרן מ-ProjectX לא נמחק מהיומן. אפשר לערוך רק את שדות היומן.");
      return;
    }

    if (!confirm("למחוק את העסקה?")) return;
    const { error } = await supabase.from("trades").delete().eq("id", tradeId);
    if (error) return toast.error(error.message);
    toast.success("העסקה נמחקה");
    navigate({ to: "/" });
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">פרטי עסקה</h1>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}>
          <ArrowLeft className="ml-1 h-4 w-4 rotate-180" />
          חזרה ליומן
        </Button>
      </div>

      <Card className={`border-0 p-5 shadow-card ${profit ? "gradient-profit glow-profit" : "gradient-loss glow-loss"}`}>
        <div className="text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs uppercase tracking-wider opacity-80">{profit ? "WIN" : "LOSS"}</p>
                {isProjectX && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold">ProjectX</span>}
              </div>
              <p className="mt-1 text-3xl font-extrabold">{fmtMoney(trade.net_pnl)}</p>
            </div>
            <div className="text-right">
              <div className="text-xs opacity-80">נקודות</div>
              <div className="text-2xl font-bold">{fmtPoints(trade.points)}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white/15 px-2 py-1">{trade.instrument}</span>
            <span className="rounded-full bg-white/15 px-2 py-1">{trade.direction}</span>
            <span className="rounded-full bg-white/15 px-2 py-1">x{trade.position_size ?? trade.size}</span>
            {form.setup_type && <span className="rounded-full bg-white/15 px-2 py-1">{form.setup_type}</span>}
          </div>
        </div>
      </Card>

      {violation && (
        <Card className="flex items-center gap-2 border-loss/40 bg-loss/10 p-3 text-sm font-semibold text-loss">
          עסקה זו סומנה כחריגה מהתוכנית
        </Card>
      )}

      {isProjectX && (
        <Card className="border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
          הנתונים הכמותיים הגיעו מ-ProjectX ונשמרים כקריאה בלבד. כאן מעדכנים רק את היומן, הלקחים וצילומי המסך.
        </Card>
      )}

      <Card className="gradient-card space-y-2 p-4">
        <h3 className="text-sm font-bold text-primary">נתוני ביצוע</h3>
        <Row k="תאריך" v={trade.trade_date} />
        <Row k="כניסה" v={formatTime(trade.entry_time)} />
        <Row k="יציאה" v={formatTime(trade.exit_time)} />
        <Row k="נכס" v={trade.instrument} />
        <Row k="חוזה" v={trade.contract_name ?? "—"} />
        <Row k="כיוון" v={trade.direction} />
        <Row k="גודל" v={trade.position_size ?? trade.size ?? "—"} />
        <Row k="מחיר כניסה" v={trade.entry_price ?? "—"} />
        <Row k="מחיר יציאה" v={trade.exit_price ?? "—"} />
        <Row k="נקודות" v={fmtPoints(trade.points)} />
        <Row k="Gross P&L" v={fmtMoney(trade.gross_pnl)} cls={pnlClass(trade.gross_pnl)} />
        <Row k="עמלות" v={fmtMoney(trade.commissions)} />
        <Row k="Net P&L" v={fmtMoney(trade.net_pnl)} cls={pnlClass(trade.net_pnl)} />
        <Row k="P&L לחוזה" v={fmtMoney(pnlPerContract)} cls={pnlClass(pnlPerContract)} />
      </Card>

      <Card className="gradient-card space-y-3 p-4">
        <div>
          <h3 className="text-sm font-bold text-primary">יומן הטרייד</h3>
          <p className="mt-1 text-xs text-muted-foreground">שדות איכותיים בלבד. סנכרון ProjectX לא ידרוס אותם.</p>
        </div>

        <Field label="Setup">
          <Select value={form.setup_type || "None"} onValueChange={(value) => set("setup_type", emptyIfNone(value))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["None", ...SETUP_TYPES].map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </Field>

        <Field label="Catalyst">
          <Select value={form.catalyst || "None"} onValueChange={(value) => {
            set("catalyst", emptyIfNone(value));
            set("catalyst_manual_override", value !== "None");
          }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATALYSTS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </Field>

        <label className="flex items-center gap-2 rounded-lg border border-border/50 bg-input/30 px-3 py-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={form.catalyst_manual_override}
            onChange={(event) => set("catalyst_manual_override", event.target.checked)}
          />
          לשמור Catalyst כעדכון ידני
        </label>

        <Field label="מצב שוק">
          <Select value={form.market_condition || "None"} onValueChange={(value) => set("market_condition", emptyIfNone(value))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["None", ...MARKET_CONDITIONS].map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </Field>

        <Field label="איכות הטרייד">
          <Select value={form.trade_quality || "None"} onValueChange={(value) => set("trade_quality", emptyIfNone(value))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["None", ...TRADE_QUALITIES].map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </Field>

        <Field label="עבדתי לפי התוכנית?">
          <Select value={form.followed_plan || "None"} onValueChange={(value) => set("followed_plan", emptyIfNone(value))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["None", ...FOLLOWED_PLAN].map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </Field>

        <Field label="סוג טעות">
          <Select value={form.mistake_type || "None"} onValueChange={(value) => set("mistake_type", emptyIfNone(value))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MISTAKE_TYPES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </Field>

        <Field label="מצב רגשי">
          <Select value={form.emotional_state || "None"} onValueChange={(value) => set("emotional_state", emptyIfNone(value))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["None", ...EMOTIONAL_STATES].map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </Field>

        <Field label="הערות">
          <Textarea rows={3} value={form.notes} onChange={(event) => set("notes", event.target.value)} />
        </Field>

        <Field label="לקח מהטרייד">
          <Textarea rows={2} value={form.lesson} onChange={(event) => set("lesson", event.target.value)} />
        </Field>

        <Button type="button" onClick={saveEnrichment} disabled={saving} className="h-11 w-full">
          <Save className="ml-2 h-4 w-4" />
          {saving ? "שומר..." : "שמור יומן טרייד"}
        </Button>
      </Card>

      <Card className="gradient-card space-y-3 p-4">
        <div>
          <h3 className="text-sm font-bold text-primary">צילומי מסך</h3>
          <p className="mt-1 text-xs text-muted-foreground">בחירת קובץ שומרת אותו מיד ב-Supabase. אין צורך בכפתור שמירה נוסף.</p>
        </div>
        <div className="space-y-4">
          {screenshotTypes.map((type) => (
            <ScreenshotSlot
              key={type.key}
              label={type.label}
              type={type.key}
              screenshots={screenshotsByType[type.key] ?? []}
              status={screenshotStatus[type.key]}
              onUpload={uploadScreenshot}
              onRemove={removeScreenshot}
            />
          ))}
        </div>
      </Card>

      <div className={`grid gap-2 ${isProjectX ? "grid-cols-1" : "grid-cols-2"}`}>
        <Button onClick={copySummary} className="h-11">
          <Copy className="ml-2 h-4 w-4" />
          העתק ל-ChatGPT
        </Button>
        {!isProjectX && (
          <Button variant="destructive" onClick={onDelete} className="h-11">
            <Trash2 className="ml-2 h-4 w-4" />
            מחק
          </Button>
        )}
      </div>
    </div>
  );
}

function ScreenshotSlot({
  label,
  type,
  screenshots,
  status,
  onUpload,
  onRemove,
}: {
  label: string;
  type: ScreenshotType;
  screenshots: any[];
  status: ScreenshotStatus;
  onUpload: (type: ScreenshotType, file?: File) => void;
  onRemove: (screenshot: any) => void;
}) {
  const busy = status === "uploading" || status === "deleting";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">{label}</Label>
          <ScreenshotStatusBadge status={status} />
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-input/40 px-2 py-1 text-[11px] text-foreground hover:border-primary/60">
          <ImagePlus className="h-3.5 w-3.5" />
          {status === "uploading" ? "מעלה..." : "הוסף"}
          <Input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              onUpload(type, event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      {screenshots.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-input/20 p-4 text-center text-xs text-muted-foreground">
          אין צילום {label}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {screenshots.map((screenshot) => {
            const src = screenshot.public_url ?? screenshot.url;
            return (
              <div key={screenshot.id} className="overflow-hidden rounded-lg border border-border bg-background/40">
                <a href={src} target="_blank" rel="noreferrer">
                  <img src={src} alt={label} className="max-h-72 w-full object-contain" />
                </a>
                <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
                  <span className="text-[11px] text-profit">נשמר ב-Supabase</span>
                  <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onRemove(screenshot)}>
                    <X className="ml-1 h-3.5 w-3.5" />
                    {status === "deleting" ? "מסיר..." : "הסר"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScreenshotStatusBadge({ status }: { status: ScreenshotStatus }) {
  if (status === "uploading") {
    return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">מעלה...</span>;
  }
  if (status === "saved") {
    return <span className="rounded-full bg-profit/10 px-2 py-0.5 text-[10px] font-semibold text-profit">נשמר</span>;
  }
  if (status === "error") {
    return <span className="rounded-full bg-loss/10 px-2 py-0.5 text-[10px] font-semibold text-loss">שגיאה בהעלאה</span>;
  }
  if (status === "deleting") {
    return <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">מסיר...</span>;
  }
  return null;
}

function Row({ k, v, cls }: { k: string; v: any; cls?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-1.5 text-sm last:border-0 last:pb-0">
      <span className="text-muted-foreground">{k}</span>
      <span className={`text-left font-semibold ${cls ?? ""}`}>{v}</span>
    </div>
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

function emptyForm(): EnrichmentForm {
  return {
    setup_type: "",
    catalyst: "",
    catalyst_manual_override: false,
    market_condition: "",
    trade_quality: "",
    followed_plan: "",
    mistake_type: "",
    emotional_state: "",
    notes: "",
    lesson: "",
  };
}

function formFromTrade(trade: any): EnrichmentForm {
  if (!trade) return emptyForm();
  return {
    setup_type: trade.setup_type ?? "",
    catalyst: trade.catalyst ?? "",
    catalyst_manual_override: Boolean(trade.catalyst_manual_override),
    market_condition: trade.market_condition ?? "",
    trade_quality: trade.trade_quality ?? "",
    followed_plan: trade.followed_plan ?? "",
    mistake_type: trade.mistake_type ?? "",
    emotional_state: trade.emotional_state ?? "",
    notes: trade.notes ?? "",
    lesson: trade.lesson ?? "",
  };
}

function groupScreenshots(screenshots: any[]) {
  return screenshots.reduce<Record<string, any[]>>((groups, screenshot) => {
    const normalized = normalizeScreenshotType(screenshot.screenshot_type ?? screenshot.kind);
    groups[normalized] = [...(groups[normalized] ?? []), screenshot];
    return groups;
  }, {});
}

function normalizeScreenshotType(type: string | null | undefined): ScreenshotType {
  if (type === "entry" || type === "exit" || type === "post_trade" || type === "other") return type;
  if (type === "post") return "post_trade";
  return "other";
}

function valueOrNull(value: string) {
  return value.trim() ? value.trim() : null;
}

function emptyIfNone(value: string) {
  return value === "None" ? "" : value;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  return value.slice(0, 5);
}
