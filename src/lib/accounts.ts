export type JournalAccount = {
  id: string;
  account_name: string | null;
  name: string | null;
  account_type: string | null;
  account_group_id: string | null;
  user_account_type: string | null;
  account_status: string | null;
  external_account_id: string | null;
  is_active: boolean | null;
  is_archived: boolean | null;
  archived_at: string | null;
  failure_reason: string | null;
  final_balance: number | null;
  final_pnl: number | null;
  cycle_number: number | null;
  cycle_status: string | null;
  reset_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  reset_reason: string | null;
  daily_loss_limit: number | null;
  max_loss_limit: number | null;
  starting_balance: number | null;
  broker_balance: number | null;
  broker_realized_pnl: number | null;
  broker_unrealized_pnl: number | null;
  broker_pnl_updated_at: string | null;
  last_api_can_trade: boolean | null;
  last_api_is_visible: boolean | null;
  last_api_balance: number | null;
};

export const ALL_ACCOUNTS = "all-active";
export const ALL_ACCOUNTS_WITH_ARCHIVE = "all-with-archive";

export const ACCOUNT_TYPES = ["Combine", "XFA", "Live", "Funded", "Other"] as const;
export const ACCOUNT_STATUSES = ["active", "not_tradable", "locked_out", "failed", "archived", "unknown"] as const;
export const CYCLE_STATUSES = ["active", "reset", "failed", "archived", "unknown"] as const;

export function accountDisplayName(account: Pick<JournalAccount, "account_name" | "name" | "external_account_id"> | null | undefined) {
  if (!account) return "כל החשבונות הפעילים";
  const display = account.account_name?.trim() || account.name?.trim();
  if (display) return display;
  return maskAccountId(account.external_account_id);
}

export function maskAccountId(value: string | null | undefined) {
  if (!value) return "Account";
  const raw = String(value);
  if (raw.length <= 4) return `Account ${raw}`;
  return `Account ${raw.slice(0, 2)}***${raw.slice(-2)}`;
}

export function isArchivedOrFailed(account: Pick<JournalAccount, "account_status" | "is_archived">) {
  return account.is_archived === true || account.account_status === "archived" || account.account_status === "failed";
}

export function isSelectableActiveAccount(account: JournalAccount) {
  return !isArchivedOrFailed(account) &&
    account.account_status === "active" &&
    account.cycle_status !== "reset" &&
    account.cycle_status !== "archived" &&
    account.cycle_status !== "failed" &&
    account.is_active !== false;
}

export function selectedAccountFilter<T extends { account_id?: string | null }>(
  rows: T[],
  accountId: string,
  accounts: JournalAccount[] = [],
) {
  if (accountId === ALL_ACCOUNTS_WITH_ARCHIVE) return rows;
  if (accountId === ALL_ACCOUNTS) {
    const activeIds = new Set(accounts.filter(isSelectableActiveAccount).map((account) => account.id));
    return activeIds.size === 0 ? rows : rows.filter((row) => !row.account_id || activeIds.has(row.account_id));
  }
  return rows.filter((row) => row.account_id === accountId);
}

export function accountTypeLabel(value: string | null | undefined) {
  if (!value) return "לא הוגדר";
  return value;
}

export function accountStatusLabel(value: string | null | undefined) {
  switch (value) {
    case "active":
      return "פעיל";
    case "not_tradable":
      return "לא ניתן למסחר";
    case "locked_out":
      return "נעול";
    case "failed":
      return "נפסל";
    case "archived":
      return "בארכיון";
    default:
      return "לא ידוע";
  }
}

export function cycleStatusLabel(value: string | null | undefined) {
  switch (value) {
    case "active":
      return "ניסיון פעיל";
    case "reset":
      return "אופס";
    case "failed":
      return "ניסיון שנפסל";
    case "archived":
      return "ניסיון בארכיון";
    default:
      return "לא ידוע";
  }
}
