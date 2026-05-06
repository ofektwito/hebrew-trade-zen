import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAccountScope } from "@/components/AccountScope";
import { supabase } from "@/integrations/supabase/client";
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  accountDisplayName,
  accountStatusLabel,
  accountTypeLabel,
  cycleStatusLabel,
  maskAccountId,
  type JournalAccount,
} from "@/lib/accounts";
import { fmtMoney, pnlClass, todayISO } from "@/lib/trade-utils";

export const Route = createFileRoute("/accounts")({
  component: AccountsPage,
});

type TradeMetric = {
  account_id: string | null;
  trade_date: string;
  net_pnl: number | null;
};

function AccountsPage() {
  const { accounts, reloadAccounts } = useAccountScope();
  const [trades, setTrades] = useState<TradeMetric[]>([]);
  const [showOldAccounts, setShowOldAccounts] = useState(false);

  useEffect(() => {
    void loadTrades();
  }, []);

  async function loadTrades() {
    const { data } = await supabase
      .from("trades")
      .select("account_id, trade_date, net_pnl")
      .is("superseded_by", null);
    setTrades((data ?? []) as TradeMetric[]);
  }

  const metricsByAccount = useMemo(() => buildAccountMetrics(accounts, trades), [accounts, trades]);
  const currentAccounts = accounts.filter((account) => account.show_in_main_selector === true && account.is_current_account === true);
  const oldAccounts = accounts.filter((account) => !(account.show_in_main_selector === true && account.is_current_account === true));
  const visibleAccounts = showOldAccounts ? accounts : currentAccounts;

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h1 className="text-xl font-bold">חשבונות</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          החשבונות הנוכחיים מופיעים באפליקציה הראשית. חשבונות ישנים נשמרים להיסטוריה ולא משפיעים על הסטטיסטיקות היומיות.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-card/60 p-3">
        <div>
          <div className="text-sm font-semibold">הצג חשבונות ישנים</div>
          <div className="text-xs text-muted-foreground">{oldAccounts.length} חשבונות שמורים בהיסטוריה</div>
        </div>
        <Switch checked={showOldAccounts} onCheckedChange={setShowOldAccounts} />
      </div>

      {accounts.length === 0 ? (
        <Card className="gradient-card p-8 text-center text-sm text-muted-foreground">
          עדיין לא נמצאו חשבונות מסונכרנים.
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleAccounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              metrics={metricsByAccount.get(account.id) ?? emptyMetrics()}
              onSaved={async () => {
                await reloadAccounts();
                await loadTrades();
              }}
            />
          ))}
          {!showOldAccounts && oldAccounts.length > 0 && (
            <Card className="gradient-card p-4 text-center text-xs text-muted-foreground">
              {oldAccounts.length} חשבונות ישנים מוסתרים. הפעל “הצג חשבונות ישנים” כדי לראות אותם.
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function AccountCard({
  account,
  metrics,
  onSaved,
}: {
  account: JournalAccount;
  metrics: ReturnType<typeof emptyMetrics>;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(account.account_name ?? "");
  const [type, setType] = useState(account.user_account_type ?? account.account_type ?? "Other");
  const [status, setStatus] = useState(account.account_status ?? "active");
  const [cycleStatus, setCycleStatus] = useState(account.cycle_status ?? "active");
  const [dailyLossLimit, setDailyLossLimit] = useState(String(account.daily_loss_limit ?? 350));
  const [failureReason, setFailureReason] = useState(account.failure_reason ?? "");
  const [isArchived, setIsArchived] = useState(account.is_archived === true || account.account_status === "archived");
  const [isCurrent, setIsCurrent] = useState(account.is_current_account === true && account.show_in_main_selector === true);
  const [saving, setSaving] = useState(false);

  const failureSuspicion = suspectedFailure(account);

  async function save() {
    setSaving(true);
    const limit = Number(dailyLossLimit);
    const nextStatus = isArchived ? "archived" : status;
    const nextCycleStatus = isArchived ? "archived" : cycleStatus;
    const showInMainSelector = isCurrent && !isArchived;
    const { error } = await supabase
      .from("accounts")
      .update({
        account_name: name.trim() || null,
        account_type: type,
        user_account_type: type,
        daily_loss_limit: Number.isFinite(limit) && limit > 0 ? limit : 350,
        account_status: nextStatus,
        cycle_status: nextCycleStatus,
        is_current_account: showInMainSelector,
        show_in_main_selector: showInMainSelector,
        is_archived: isArchived,
        archived_at: isArchived ? (account.archived_at ?? new Date().toISOString()) : null,
        ended_at: nextCycleStatus === "active" ? null : (account.ended_at ?? new Date().toISOString()),
        failure_reason: failureReason.trim() || null,
        reset_reason: nextCycleStatus === "reset" ? (failureReason.trim() || "Reset manually") : account.reset_reason,
        final_balance: nextStatus === "failed" || nextCycleStatus === "failed" || isArchived ? (account.last_api_balance ?? account.broker_balance ?? metrics.totalPnl) : null,
        final_pnl: nextStatus === "failed" || nextCycleStatus === "failed" || isArchived ? metrics.totalPnl : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("החשבון נשמר");
    await onSaved();
  }

  return (
    <Card className="gradient-card space-y-4 p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold">{accountDisplayName(account)}</h2>
            <Badge variant="outline">{accountStatusLabel(account.account_status)}</Badge>
            <Badge variant="outline">ניסיון {account.cycle_number ?? 1} · {cycleStatusLabel(account.cycle_status)}</Badge>
            {account.show_in_main_selector && <Badge className="bg-emerald-500/15 text-emerald-300">מוצג באפליקציה</Badge>}
            {account.is_archived && <Badge variant="secondary">בארכיון</Badge>}
            {failureSuspicion && <Badge className="bg-amber-500/15 text-amber-300">חשד לפסילה לפי יתרה</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {maskAccountId(account.external_account_id)} · {accountTypeLabel(account.user_account_type ?? account.account_type)}
          </p>
        </div>
        <div className={`text-left text-lg font-bold ${pnlClass(metrics.totalPnl)}`}>{fmtMoney(metrics.totalPnl)}</div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {account.last_api_balance != null && <MiniStat label="ProjectX Balance" value={fmtMoney(account.last_api_balance)} />}
        {account.broker_realized_pnl != null && <MiniStat label="Broker RP&L" value={fmtMoney(account.broker_realized_pnl)} pnl={account.broker_realized_pnl} />}
        <MiniStat label="canTrade" value={yesNo(account.last_api_can_trade)} />
        <MiniStat label="isVisible" value={yesNo(account.last_api_is_visible)} />
        <MiniStat label="מחזור" value={`ניסיון ${account.cycle_number ?? 1}`} />
        <MiniStat label="באפליקציה" value={account.show_in_main_selector ? "כן" : "לא"} />
        {account.final_balance != null && <MiniStat label="יתרה סופית" value={fmtMoney(account.final_balance)} />}
        {account.max_loss_limit != null && <MiniStat label="Max Loss" value={fmtMoney(account.max_loss_limit)} />}
        <MiniStat label="P&L היום" value={fmtMoney(metrics.todayPnl)} pnl={metrics.todayPnl} />
        <MiniStat label="P&L חודשי" value={fmtMoney(metrics.monthPnl)} pnl={metrics.monthPnl} />
        <MiniStat label="P&L לפי יומן" value={fmtMoney(metrics.totalPnl)} pnl={metrics.totalPnl} />
        <MiniStat label="טריידים" value={String(metrics.tradeCount)} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="שם תצוגה">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="XFA ראשי" />
        </Field>
        <Field label="סוג חשבון">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="סטטוס">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACCOUNT_STATUSES.map((option) => <SelectItem key={option} value={option}>{accountStatusLabel(option)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="סטטוס ניסיון">
          <Select value={cycleStatus} onValueChange={setCycleStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["active", "reset", "failed", "archived", "unknown"].map((option) => <SelectItem key={option} value={option}>{cycleStatusLabel(option)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="מגבלת הפסד יומית">
          <Input type="number" min={1} step="1" value={dailyLossLimit} onChange={(event) => setDailyLossLimit(event.target.value)} />
        </Field>
        <Field label="סיבת פסילה / הערה">
          <Input value={failureReason} onChange={(event) => setFailureReason(event.target.value)} placeholder="אופציונלי" />
        </Field>
        <div className="flex items-end justify-between rounded-md bg-input/30 p-3">
          <Label className="text-xs text-muted-foreground">העבר לארכיון</Label>
          <Switch checked={isArchived} onCheckedChange={setIsArchived} />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant={isCurrent ? "secondary" : "outline"} onClick={() => { setIsCurrent(true); setIsArchived(false); }}>
          הפוך לחשבון נוכחי
        </Button>
        <Button type="button" variant="outline" onClick={() => { setIsCurrent(false); setIsArchived(true); setStatus("archived"); setCycleStatus("archived"); }}>
          העבר להיסטוריה
        </Button>
      </div>

      <Button type="button" onClick={save} disabled={saving} className="w-full">
        {saving ? "שומר..." : "שמור חשבון"}
      </Button>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}

function MiniStat({ label, value, pnl }: { label: string; value: string; pnl?: number | null }) {
  return (
    <div className="rounded-md bg-input/30 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`font-semibold ${pnl !== undefined ? pnlClass(pnl) : ""}`}>{value}</div>
    </div>
  );
}

function buildAccountMetrics(accounts: JournalAccount[], trades: TradeMetric[]) {
  const today = todayISO();
  const month = today.slice(0, 7);
  const map = new Map<string, ReturnType<typeof emptyMetrics>>();
  for (const account of accounts) map.set(account.id, emptyMetrics());
  for (const trade of trades) {
    if (!trade.account_id) continue;
    const metrics = map.get(trade.account_id) ?? emptyMetrics();
    const pnl = trade.net_pnl ?? 0;
    metrics.totalPnl += pnl;
    metrics.tradeCount += 1;
    if (trade.trade_date === today) metrics.todayPnl += pnl;
    if (trade.trade_date?.startsWith(month)) metrics.monthPnl += pnl;
    map.set(trade.account_id, metrics);
  }
  return map;
}

function suspectedFailure(account: JournalAccount) {
  if (account.starting_balance == null || account.max_loss_limit == null || account.last_api_balance == null) return false;
  return account.last_api_balance <= account.starting_balance - account.max_loss_limit;
}

function yesNo(value: boolean | null) {
  if (value === true) return "כן";
  if (value === false) return "לא";
  return "לא ידוע";
}

function emptyMetrics() {
  return { todayPnl: 0, monthPnl: 0, totalPnl: 0, tradeCount: 0 };
}
