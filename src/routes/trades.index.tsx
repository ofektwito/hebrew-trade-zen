import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FOLLOWED_PLAN, INSTRUMENTS, MISTAKE_TYPES, SETUP_TYPES, formatDisplayDate, formatDisplayTime, fmtMoney, fmtPoints, pnlClass } from "@/lib/trade-utils";
import { Camera, FileText, Search, SlidersHorizontal } from "lucide-react";
import { useAccountScope } from "@/components/AccountScope";
import { ALL_ACCOUNTS } from "@/lib/accounts";

export const Route = createFileRoute("/trades/")({
  component: TradesPage,
});

type TradeRow = {
  id: string;
  account_id: string | null;
  source: string | null;
  trade_date: string;
  entry_time: string | null;
  exit_time: string | null;
  instrument: string;
  contract_name: string | null;
  direction: string;
  position_size: number | null;
  size: number | null;
  max_position_size: number | null;
  total_opened_size: number | null;
  executions_count: number | null;
  entry_price: number | null;
  exit_price: number | null;
  points: number | null;
  net_pnl: number | null;
  catalyst: string | null;
  setup_type: string | null;
  mistake_type: string | null;
  followed_plan: string | null;
  notes: string | null;
  lesson: string | null;
};

type Filters = {
  from: string;
  to: string;
  instrument: string;
  direction: string;
  pnl: string;
  setup: string;
  mistake: string;
  followedPlan: string;
  missingScreenshots: boolean;
  missingLesson: boolean;
};

function TradesPage() {
  const { selectedAccountId, isAllAccounts, labelForAccount } = useAccountScope();
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [screenshotTradeIds, setScreenshotTradeIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    from: "",
    to: "",
    instrument: "all",
    direction: "all",
    pnl: "all",
    setup: "all",
    mistake: "all",
    followedPlan: "all",
    missingScreenshots: false,
    missingLesson: false,
  });

  useEffect(() => {
    (async () => {
      let tradeQuery = supabase
          .from("trades")
          .select("*")
          .is("superseded_by", null)
          .order("trade_date", { ascending: false })
          .order("entry_time", { ascending: false });

      if (selectedAccountId !== ALL_ACCOUNTS) tradeQuery = tradeQuery.eq("account_id", selectedAccountId);

      const [{ data: tradeRows }, { data: screenshotRows }] = await Promise.all([
        tradeQuery,
        supabase.from("screenshots").select("trade_id").not("trade_id", "is", null),
      ]);

      setTrades((tradeRows ?? []) as TradeRow[]);
      setScreenshotTradeIds(new Set((screenshotRows ?? []).map((shot) => shot.trade_id).filter(Boolean)));
      setLoading(false);
    })();
  }, [selectedAccountId]);

  const filteredTrades = useMemo(
    () => trades.filter((trade) => matchesFilters(trade, filters, screenshotTradeIds)),
    [trades, filters, screenshotTradeIds],
  );

  const projectXCount = trades.filter((trade) => trade.source === "projectx").length;
  const net = filteredTrades.reduce((sum, trade) => sum + (trade.net_pnl ?? 0), 0);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">עסקאות</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAllAccounts ? "כל החשבונות" : labelForAccount(selectedAccountId)} · כל הטריידים המסונכרנים מ-ProjectX מוצגים כטרייד יומן אחד לכל lifecycle של פוזיציה.
          </p>
        </div>
        <Badge className="border-primary/30 bg-primary/10 text-primary" variant="outline">
          {projectXCount} ProjectX
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="עסקאות מוצגות" value={String(filteredTrades.length)} />
        <Stat label="Net מסונן" value={fmtMoney(net)} pnl={net} />
      </div>

      <Card className="gradient-card space-y-3 p-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-primary">סינון וחיפוש</h2>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="מתאריך">
            <Input type="date" value={filters.from} onChange={(event) => setFilter("from", event.target.value)} />
          </Field>
          <Field label="עד תאריך">
            <Input type="date" value={filters.to} onChange={(event) => setFilter("to", event.target.value)} />
          </Field>
          <Field label="נכס">
            <FilterSelect value={filters.instrument} onChange={(value) => setFilter("instrument", value)} options={INSTRUMENTS} />
          </Field>
          <Field label="כיוון">
            <FilterSelect value={filters.direction} onChange={(value) => setFilter("direction", value)} options={["Long", "Short"]} />
          </Field>
          <Field label="P&L">
            <FilterSelect value={filters.pnl} onChange={(value) => setFilter("pnl", value)} options={["חיובי", "שלילי", "Break-even"]} values={["positive", "negative", "even"]} />
          </Field>
          <Field label="Setup">
            <FilterSelect value={filters.setup} onChange={(value) => setFilter("setup", value)} options={SETUP_TYPES} />
          </Field>
          <Field label="טעות">
            <FilterSelect value={filters.mistake} onChange={(value) => setFilter("mistake", value)} options={MISTAKE_TYPES} />
          </Field>
          <Field label="תוכנית">
            <FilterSelect value={filters.followedPlan} onChange={(value) => setFilter("followedPlan", value)} options={FOLLOWED_PLAN} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <ToggleFilter
            checked={filters.missingScreenshots}
            label="חסר צילום"
            onChange={(checked) => setFilter("missingScreenshots", checked)}
          />
          <ToggleFilter
            checked={filters.missingLesson}
            label="חסר לקח"
            onChange={(checked) => setFilter("missingLesson", checked)}
          />
        </div>
      </Card>

      {loading ? (
        <Card className="gradient-card p-8 text-center text-sm text-muted-foreground">טוען עסקאות...</Card>
      ) : filteredTrades.length === 0 ? (
        <Card className="gradient-card p-8 text-center">
          <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">אין עסקאות שמתאימות לסינון הנוכחי</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredTrades.map((trade) => (
            <TradeCard key={trade.id} trade={trade} hasScreenshots={screenshotTradeIds.has(trade.id)} accountLabel={labelForAccount(trade.account_id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TradeCard({ trade, hasScreenshots, accountLabel }: { trade: TradeRow; hasScreenshots: boolean; accountLabel: string }) {
  const hasLesson = Boolean(trade.lesson?.trim() || trade.notes?.trim());
  const displaySize = trade.max_position_size ?? trade.position_size ?? trade.size ?? "—";
  const totalOpened = trade.total_opened_size ?? trade.size ?? "—";
  const executionsCount = trade.executions_count ?? 0;

  return (
    <Link to="/trades/$tradeId" params={{ tradeId: trade.id }}>
      <Card className="gradient-card border-border/70 p-3 shadow-card transition-colors hover:border-primary/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{trade.instrument}</span>
              {trade.contract_name && <span className="text-xs text-muted-foreground">{trade.contract_name}</span>}
              {trade.source === "projectx" && <Badge variant="secondary" className="text-[10px]">ProjectX</Badge>}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {accountLabel} · {formatDisplayDate(trade.trade_date)} · {formatDisplayTimeFromTrade(trade.entry_time)}-{formatDisplayTimeFromTrade(trade.exit_time)} · {trade.direction} · max x{displaySize}
            </div>
          </div>
          <div className={`shrink-0 text-left text-lg font-bold ${pnlClass(trade.net_pnl)}`}>{fmtMoney(trade.net_pnl)}</div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <MiniStat label="כניסה ממוצעת" value={formatNumber(trade.entry_price)} />
          <MiniStat label="יציאה ממוצעת" value={formatNumber(trade.exit_price)} />
          <MiniStat label="נקודות" value={fmtPoints(trade.points)} />
          <MiniStat label="ביצועים" value={String(executionsCount)} />
          <MiniStat label="נפתח" value={`x${totalOpened}`} />
          <MiniStat label="מקס גודל" value={`x${displaySize}`} />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {trade.catalyst && <Badge variant="outline">Catalyst: {trade.catalyst}</Badge>}
          {trade.setup_type && <Badge variant="outline">Setup: {trade.setup_type}</Badge>}
          {trade.mistake_type && trade.mistake_type !== "None" && <Badge className="border-loss/30 bg-loss/10 text-loss">טעות: {trade.mistake_type}</Badge>}
          {trade.followed_plan && <Badge variant="outline">תוכנית: {trade.followed_plan}</Badge>}
          <Badge variant="outline" className={hasScreenshots ? "border-profit/40 text-profit" : "border-muted text-muted-foreground"}>
            <Camera className="ml-1 h-3 w-3" />
            {hasScreenshots ? "יש צילום" : "חסר צילום"}
          </Badge>
          <Badge variant="outline" className={hasLesson ? "border-profit/40 text-profit" : "border-muted text-muted-foreground"}>
            <FileText className="ml-1 h-3 w-3" />
            {hasLesson ? "יש לקח" : "חסר לקח"}
          </Badge>
        </div>
      </Card>
    </Link>
  );
}

function matchesFilters(trade: TradeRow, filters: Filters, screenshotTradeIds: Set<string>) {
  if (filters.from && trade.trade_date < filters.from) return false;
  if (filters.to && trade.trade_date > filters.to) return false;
  if (filters.instrument !== "all" && trade.instrument !== filters.instrument) return false;
  if (filters.direction !== "all" && trade.direction !== filters.direction) return false;
  if (filters.pnl === "positive" && (trade.net_pnl ?? 0) <= 0) return false;
  if (filters.pnl === "negative" && (trade.net_pnl ?? 0) >= 0) return false;
  if (filters.pnl === "even" && (trade.net_pnl ?? 0) !== 0) return false;
  if (filters.setup !== "all" && trade.setup_type !== filters.setup) return false;
  if (filters.mistake !== "all" && trade.mistake_type !== filters.mistake) return false;
  if (filters.followedPlan !== "all" && trade.followed_plan !== filters.followedPlan) return false;
  if (filters.missingScreenshots && screenshotTradeIds.has(trade.id)) return false;
  if (filters.missingLesson && Boolean(trade.lesson?.trim() || trade.notes?.trim())) return false;
  return true;
}

function FilterSelect({
  value,
  onChange,
  options,
  values,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  values?: readonly string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">הכל</SelectItem>
        {options.map((option, index) => (
          <SelectItem key={option} value={values?.[index] ?? option}>{option}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ToggleFilter({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className={`flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold ${checked ? "border-primary bg-primary/10 text-primary" : "border-border bg-input/30 text-muted-foreground"}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="sr-only" />
      {label}
    </label>
  );
}

function Stat({ label, value, pnl }: { label: string; value: string; pnl?: number | null }) {
  return (
    <Card className="gradient-card p-3 shadow-card">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold ${pnl !== undefined ? pnlClass(pnl) : ""}`}>{value}</p>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-input/30 px-2 py-1">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function formatDisplayTimeFromTrade(value: string | null) {
  if (!value) return "—";
  if (value.includes("T")) return formatDisplayTime(value);
  return value.slice(0, 5);
}

function formatNumber(value: number | null) {
  return value == null ? "—" : String(value);
}
