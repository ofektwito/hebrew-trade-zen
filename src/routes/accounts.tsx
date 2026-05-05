import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAccountScope } from "@/components/AccountScope";
import { ACCOUNT_TYPES, accountDisplayName, accountTypeLabel, maskAccountId, type JournalAccount } from "@/lib/accounts";
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

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h1 className="text-xl font-bold">חשבונות</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          ProjectX מסנכרן מזהים וטריידים. כאן מנהלים רק שם תצוגה, סוג חשבון ומגבלת הפסד יומית.
        </p>
      </div>

      {accounts.length === 0 ? (
        <Card className="gradient-card p-8 text-center text-sm text-muted-foreground">
          עדיין לא נמצאו חשבונות מסונכרנים.
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
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
  const [type, setType] = useState(account.account_type ?? "Other");
  const [dailyLossLimit, setDailyLossLimit] = useState(String(account.daily_loss_limit ?? 350));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const limit = Number(dailyLossLimit);
    const { error } = await supabase
      .from("accounts")
      .update({
        account_name: name.trim() || null,
        account_type: type,
        daily_loss_limit: Number.isFinite(limit) && limit > 0 ? limit : 350,
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
          <h2 className="font-bold">{accountDisplayName(account)}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {maskAccountId(account.external_account_id)} · {accountTypeLabel(account.account_type)} · {account.is_active === false ? "לא פעיל" : "פעיל"}
          </p>
        </div>
        <div className={`text-left text-lg font-bold ${pnlClass(metrics.totalPnl)}`}>{fmtMoney(metrics.totalPnl)}</div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {account.broker_balance != null && <MiniStat label="Broker BAL" value={fmtMoney(account.broker_balance)} />}
        {account.broker_realized_pnl != null && <MiniStat label="Broker RP&L" value={fmtMoney(account.broker_realized_pnl)} pnl={account.broker_realized_pnl} />}
        {account.broker_realized_pnl != null && <MiniStat label="הפרש Broker-יומן" value={fmtMoney(account.broker_realized_pnl - metrics.totalPnl)} pnl={account.broker_realized_pnl - metrics.totalPnl} />}
        <MiniStat label="P&L היום" value={fmtMoney(metrics.todayPnl)} pnl={metrics.todayPnl} />
        <MiniStat label="P&L חודשי" value={fmtMoney(metrics.monthPnl)} pnl={metrics.monthPnl} />
        <MiniStat label="P&L לפי יומן" value={fmtMoney(metrics.totalPnl)} pnl={metrics.totalPnl} />
        <MiniStat label="טריידים" value={String(metrics.tradeCount)} />
        <MiniStat label="סטופ יומי" value={`-${fmtMoney(Number(dailyLossLimit || 350))}`} />
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
        <Field label="מגבלת הפסד יומית">
          <Input type="number" min={1} step="1" value={dailyLossLimit} onChange={(event) => setDailyLossLimit(event.target.value)} />
        </Field>
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

function emptyMetrics() {
  return { todayPnl: 0, monthPnl: 0, totalPnl: 0, tradeCount: 0 };
}
