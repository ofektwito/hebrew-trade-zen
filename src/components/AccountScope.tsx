import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALL_ACCOUNTS, accountDisplayName, type JournalAccount } from "@/lib/accounts";

const STORAGE_KEY = "tradeJournal:selectedAccountId";

type AccountScopeContextValue = {
  accounts: JournalAccount[];
  selectedAccountId: string;
  selectedAccount: JournalAccount | null;
  isAllAccounts: boolean;
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
      .select("id, account_name, name, account_type, external_account_id, is_active, daily_loss_limit, broker_balance, broker_realized_pnl, broker_unrealized_pnl, broker_pnl_updated_at")
      .order("created_at", { ascending: true });

    const rows = (data ?? []) as JournalAccount[];
    setAccounts(rows);
    setLoadingAccounts(false);

    if (selectedAccountId !== ALL_ACCOUNTS && !rows.some((account) => account.id === selectedAccountId)) {
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
    const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
    return {
      accounts,
      selectedAccountId,
      selectedAccount,
      isAllAccounts: selectedAccountId === ALL_ACCOUNTS,
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
  const { accounts, selectedAccountId, setSelectedAccountId, loadingAccounts } = useAccountScope();

  return (
    <Select value={selectedAccountId} onValueChange={setSelectedAccountId} disabled={loadingAccounts}>
      <SelectTrigger className="h-8 max-w-[190px] rounded-full border-border bg-input/40 px-3 text-xs font-semibold">
        <SelectValue placeholder="כל החשבונות" />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={ALL_ACCOUNTS}>כל החשבונות</SelectItem>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {accountDisplayName(account)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
