ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS account_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS user_account_type text,
  ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS final_balance numeric,
  ADD COLUMN IF NOT EXISTS final_pnl numeric,
  ADD COLUMN IF NOT EXISTS last_api_can_trade boolean,
  ADD COLUMN IF NOT EXISTS last_api_is_visible boolean,
  ADD COLUMN IF NOT EXISTS last_api_balance numeric,
  ADD COLUMN IF NOT EXISTS last_api_status_raw jsonb;

UPDATE public.accounts
SET account_status = COALESCE(account_status, CASE WHEN is_active = false THEN 'not_tradable' ELSE 'active' END),
    user_account_type = COALESCE(user_account_type, account_type),
    is_archived = COALESCE(is_archived, false),
    last_api_balance = COALESCE(last_api_balance, broker_balance)
WHERE external_source = 'projectx';

CREATE INDEX IF NOT EXISTS accounts_account_status_idx ON public.accounts(account_status);
CREATE INDEX IF NOT EXISTS accounts_is_archived_idx ON public.accounts(is_archived);
