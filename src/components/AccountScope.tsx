import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ALL_ACCOUNTS,
  ALL_ACCOUNTS_WITH_ARCHIVE,
  accountDisplayName,
  accountStatusLabel,
  isSelectableActiveAccount,
  type JournalAccount,
} from "@/lib/accounts";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "tradeJournal:selectedAccountId";
const ACCOUNT_COLUMNS = [
  "id",
  "account_name",
  "name",
  "account_type",
  "account_group_id",
  "user_account_type",
  "account_status",
  "external_account_id",
  "is_active",
  "is_archived",
  "archived_at",
  "failure_reason",
  "final_balance",
  "final_pnl",
  "cycle_number",
  "cycle_status",
  "reset_at",
  "started_at",
  "ended_at",
  "reset_reason",
  "daily_loss_limit",
  "max_loss_limit",
  "starting_balance",
  "broker_balance",
  "broker_realized_pnl",
  "broker_unrealized_pnl",
  "broker_pnl_updated_at",
  "last_api_can_trade",
  "last_api_is_visible",
  "last_api_balance",
].join(", ");

type AccountScopeContextValue = {
  accounts: JournalAccount[];
  activeAccounts: JournalAccount[];
  selectedAccountId: string;
  selectedAccount: JournalAccount | null;
  isAllAccounts: boolean;
  includeArchivedAccounts: boolean;
  scopedAccountIds: string[] | null;
  loadingAccounts: boolean;
  setSelectedAccountId: (accountId: string) => void;
  reloadAccounts: () => Promise<void>;
  labelForAccount: (accountId: string | null | undefined) => string;
};

const AccountScopeContext = createContext<AccountScopeContextValue | null>(null);

export function AccountScopeProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<JournalAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedAccountId, setSelectedAccountIdState] = useState(() => {
    if (typeof window === "undefined") return ALL_ACCOUNTS;
    return window.localStorage.getItem(STORAGE_KEY) || ALL_ACCOUNTS;
  });

  useEffect(() => {
    void loadAccounts();
  }, []);

  async function loadAccounts() {
    setLoadingAccounts(true);
    const { data } = await supabase
      .from("accounts")
      .select(ACCOUNT_COLUMNS)
      .order("created_at", { ascending: true });

    const rows = (data ?? []) as JournalAccount[];
    setAccounts(rows);
    setLoadingAccounts(false);

    if (
      selectedAccountId !== ALL_ACCOUNTS &&
      selectedAccountId !== ALL_ACCOUNTS_WITH_ARCHIVE &&
      !rows.some((account) => account.id === selectedAccountId)
    ) {
      setSelectedAccountId(ALL_ACCOUNTS);
    }
  }

  function setSelectedAccountId(accountId: string) {
    setSelectedAccountIdState(accountId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, accountId);
    }
  }

  const value = useMemo<AccountScopeContextValue>(() => {
    const activeAccounts = accounts.filter(isSelectableActiveAccount);
    const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
    const scopedAccountIds =
      selectedAccountId === ALL_ACCOUNTS_WITH_ARCHIVE
        ? null
        : selectedAccountId === ALL_ACCOUNTS
          ? activeAccounts.map((account) => account.id)
          : [selectedAccountId];

    return {
      accounts,
      activeAccounts,
      selectedAccountId,
      selectedAccount,
      isAllAccounts: selectedAccountId === ALL_ACCOUNTS || selectedAccountId === ALL_ACCOUNTS_WITH_ARCHIVE,
      includeArchivedAccounts: selectedAccountId === ALL_ACCOUNTS_WITH_ARCHIVE,
      scopedAccountIds,
      loadingAccounts,
      setSelectedAccountId,
      reloadAccounts: loadAccounts,
      labelForAccount: (accountId) => {
        const account = accounts.find((row) => row.id === accountId);
        return accountDisplayName(account);
      },
    };
  }, [accounts, loadingAccounts, selectedAccountId]);

  return <AccountScopeContext.Provider value={value}>{children}</AccountScopeContext.Provider>;
}

export function useAccountScope() {
  const value = useContext(AccountScopeContext);
  if (!value) throw new Error("useAccountScope must be used inside AccountScopeProvider");
  return value;
}

export function AccountSelector() {
  const { activeAccounts, accounts, selectedAccountId, setSelectedAccountId, loadingAccounts } = useAccountScope();
  const archivedAccounts = accounts.filter((account) => !isSelectableActiveAccount(account));

  return (
    <Select value={selectedAccountId} onValueChange={setSelectedAccountId} disabled={loadingAccounts}>
      <SelectTrigger className="h-8 max-w-[220px] rounded-full border-border bg-input/40 px-3 text-xs font-semibold">
        <SelectValue placeholder="כל החשבונות הפעילים" />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={ALL_ACCOUNTS}>כל החשבונות הפעילים</SelectItem>
        <SelectItem value={ALL_ACCOUNTS_WITH_ARCHIVE}>כל החשבונות כולל ארכיון</SelectItem>
        {activeAccounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {accountDisplayName(account)}
          </SelectItem>
        ))}
        {archivedAccounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {accountDisplayName(account)} · {accountStatusLabel(account.account_status)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
