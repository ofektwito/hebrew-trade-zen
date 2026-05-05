export type JournalAccount = {
  id: string;
  account_name: string | null;
  name: string | null;
  account_type: string | null;
  external_account_id: string | null;
  is_active: boolean | null;
  daily_loss_limit: number | null;
};

export const ALL_ACCOUNTS = "all";

export const ACCOUNT_TYPES = ["Combine", "XFA", "Live", "Funded", "Other"] as const;

export function accountDisplayName(account: Pick<JournalAccount, "account_name" | "name" | "external_account_id"> | null | undefined) {
  if (!account) return "כל החשבונות";
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

export function selectedAccountFilter<T extends { account_id?: string | null }>(rows: T[], accountId: string) {
  if (accountId === ALL_ACCOUNTS) return rows;
  return rows.filter((row) => row.account_id === accountId);
}

export function accountTypeLabel(value: string | null | undefined) {
  if (!value) return "לא הוגדר";
  return value;
}
