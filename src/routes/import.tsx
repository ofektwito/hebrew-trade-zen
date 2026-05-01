import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { fmtMoney, pnlClass, calcPoints, calcGrossPnl, INSTRUMENT_POINT_VALUE } from "@/lib/trade-utils";
import { toast } from "sonner";
import { Upload, Save } from "lucide-react";

export const Route = createFileRoute("/import")({
  component: ImportPage,
});

interface ParsedTrade {
  trade_date: string;
  entry_time: string | null;
  exit_time: string | null;
  instrument: string;
  contract_name: string;
  direction: "Long" | "Short";
  position_size: number;
  entry_price: number;
  exit_price: number;
  points: number;
  gross_pnl: number;
  commissions: number;
  net_pnl: number;
  selected: boolean;
}

function detectInstrument(symbol: string): { instrument: string; contract: string } {
  const s = symbol.toUpperCase();
  for (const k of ["MNQ", "MES", "NQ", "ES"]) {
    if (s.includes(k)) return { instrument: k, contract: s };
  }
  return { instrument: "Other", contract: s };
}

// Parse CSV from TopstepX. Tries to handle order history with fills.
// Heuristic: split rows, detect columns by header. Group consecutive opposite-direction fills on the same symbol into trades.
function parseTopstepCSV(csv: string): ParsedTrade[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const splitRow = (line: string): string[] => {
    const out: string[] = []; let cur = ""; let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim().replace(/^"|"$/g, ""));
  };

  const headers = splitRow(lines[0]).map((h) => h.toLowerCase());
  const idx = (names: string[]) => headers.findIndex((h) => names.some((n) => h.includes(n)));

  const iSymbol = idx(["symbol", "contract", "instrument"]);
  const iSide = idx(["side", "b/s", "buy/sell", "action"]);
  const iQty = idx(["qty", "quantity", "size", "filled"]);
  const iPrice = idx(["price", "fill price", "avg"]);
  const iTime = idx(["time", "date", "timestamp", "filled time"]);
  const iComm = idx(["commission", "fee"]);
  const iStatus = idx(["status"]);

  if (iSymbol < 0 || iSide < 0 || iQty < 0 || iPrice < 0) return [];

  // Parse fills
  const fills: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const r = splitRow(lines[i]);
    const status = iStatus >= 0 ? r[iStatus]?.toLowerCase() : "";
    if (status && !status.includes("fill") && !status.includes("done") && !status.includes("complete")) continue;

    const symbol = r[iSymbol] ?? "";
    const sideRaw = (r[iSide] ?? "").toLowerCase();
    const side: "B" | "S" = sideRaw.startsWith("b") || sideRaw.includes("buy") ? "B" : "S";
    const qty = parseFloat(r[iQty]) || 0;
    const price = parseFloat(r[iPrice]) || 0;
    const timeStr = iTime >= 0 ? r[iTime] : "";
    const comm = iComm >= 0 ? parseFloat(r[iComm]) || 0 : 0;
    if (!symbol || !qty || !price) continue;
    const dt = parseDate(timeStr);
    fills.push({ symbol, side, qty, price, dt, comm });
  }

  // Sort by datetime
  fills.sort((a, b) => (a.dt?.getTime() ?? 0) - (b.dt?.getTime() ?? 0));

  // FIFO match per symbol
  const open: Record<string, any[]> = {};
  const trades: ParsedTrade[] = [];

  for (const f of fills) {
    const key = f.symbol;
    open[key] = open[key] ?? [];
    let remainingQty = f.qty;
    while (remainingQty > 0 && open[key].length > 0 && open[key][0].side !== f.side) {
      const o = open[key][0];
      const matched = Math.min(o.qty, remainingQty);
      const direction: "Long" | "Short" = o.side === "B" ? "Long" : "Short";
      const entry_price = o.price;
      const exit_price = f.price;
      const points = calcPoints(direction, entry_price, exit_price) ?? 0;
      const { instrument, contract } = detectInstrument(f.symbol);
      const gross = calcGrossPnl(instrument, points, matched) ?? 0;
      const commissions = (o.comm * (matched / o.qty)) + (f.comm * (matched / f.qty));
      trades.push({
        trade_date: (o.dt ?? f.dt ?? new Date()).toISOString().slice(0, 10),
        entry_time: o.dt ? toHHMM(o.dt) : null,
        exit_time: f.dt ? toHHMM(f.dt) : null,
        instrument, contract_name: contract, direction,
        position_size: matched,
        entry_price, exit_price, points,
        gross_pnl: gross, commissions, net_pnl: gross - commissions,
        selected: true,
      });
      o.qty -= matched;
      remainingQty -= matched;
      if (o.qty <= 0) open[key].shift();
    }
    if (remainingQty > 0) open[key].push({ ...f, qty: remainingQty });
  }
  return trades;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function toHHMM(d: Date): string {
  return d.toTimeString().slice(0, 5);
}

function ImportPage() {
  const navigate = useNavigate();
  const [csv, setCsv] = useState("");
  const [parsed, setParsed] = useState<ParsedTrade[]>([]);
  const [saving, setSaving] = useState(false);

  function onParse() {
    const t = parseTopstepCSV(csv);
    if (t.length === 0) {
      toast.error("לא נמצאו עסקאות בקובץ. ודא שמדובר ב-CSV של order history");
      return;
    }
    setParsed(t);
    toast.success(`נמצאו ${t.length} עסקאות`);
  }

  function toggle(i: number) {
    setParsed((p) => p.map((t, idx) => (idx === i ? { ...t, selected: !t.selected } : t)));
  }

  async function onSave() {
    const toSave = parsed.filter((t) => t.selected);
    if (!toSave.length) return toast.error("בחר לפחות עסקה אחת");
    setSaving(true);
    try {
      const rows = toSave.map(({ selected, ...rest }) => ({ ...rest, order_type: "Market" }));
      const { error } = await supabase.from("trades").insert(rows);
      if (error) throw error;
      toast.success(`נשמרו ${rows.length} עסקאות`);
      navigate({ to: "/" });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const total = parsed.filter((t) => t.selected).reduce((s, t) => s + t.net_pnl, 0);

  return (
    <div className="space-y-4 pb-4">
      <h1 className="text-xl font-bold">ייבוא מ-TopstepX</h1>

      <Card className="p-4 gradient-card space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">הדבק כאן CSV של order history</Label>
          <Textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="Symbol,Side,Qty,Price,Time,Commission..." className="font-mono text-xs mt-1" />
        </div>
        <Button onClick={onParse} className="w-full"><Upload className="h-4 w-4 ml-2" /> פענח עסקאות</Button>
      </Card>

      {parsed.length > 0 && (
        <>
          <Card className="p-3 gradient-card border-primary/30 flex items-center justify-between">
            <span className="text-sm">סה״כ נבחרו: <span className="font-bold">{parsed.filter((t) => t.selected).length}</span></span>
            <span className={`font-bold ${pnlClass(total)}`}>{fmtMoney(total)}</span>
          </Card>

          <div className="space-y-2">
            {parsed.map((t, i) => (
              <Card key={i} className={`p-3 gradient-card flex items-center gap-3 ${t.selected ? "" : "opacity-50"}`}>
                <input type="checkbox" checked={t.selected} onChange={() => toggle(i)} className="h-4 w-4 accent-primary" />
                <div className="flex-1">
                  <div className="font-semibold text-sm">{t.instrument} {t.direction} x{t.position_size}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t.trade_date} {t.entry_time}→{t.exit_time} · {t.entry_price}→{t.exit_price}
                  </div>
                </div>
                <div className={`font-bold text-sm ${pnlClass(t.net_pnl)}`}>{fmtMoney(t.net_pnl)}</div>
              </Card>
            ))}
          </div>

          <Button onClick={onSave} disabled={saving} className="w-full h-12 font-bold">
            <Save className="h-4 w-4 ml-2" /> {saving ? "שומר..." : `שמור ${parsed.filter((t) => t.selected).length} עסקאות`}
          </Button>
        </>
      )}

      <Card className="p-3 gradient-card">
        <p className="text-xs text-muted-foreground">
          הייבוא מצפה לעמודות: Symbol, Side (Buy/Sell), Qty, Price, Time, Commission. הוא מבצע FIFO matching של פילים פתוחים מול סוגרים, מזהה אוטומטית MNQ/MES/NQ/ES ומחשב P&L.
        </p>
      </Card>
    </div>
  );
}
