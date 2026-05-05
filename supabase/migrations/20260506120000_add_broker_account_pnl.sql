ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS broker_balance numeric,
  ADD COLUMN IF NOT EXISTS broker_realized_pnl numeric,
  ADD COLUMN IF NOT EXISTS broker_unrealized_pnl numeric,
  ADD COLUMN IF NOT EXISTS broker_pnl_updated_at timestamptz;

-- Previous syncs stored the live ProjectX balance in starting_balance. Keep
-- that value as the broker balance so the UI can reconcile journal P&L against
-- the broker source of truth.
UPDATE public.accounts
SET broker_balance = COALESCE(broker_balance, starting_balance),
    broker_pnl_updated_at = COALESCE(broker_pnl_updated_at, last_synced_at, updated_at)
WHERE external_source = 'projectx'
  AND starting_balance IS NOT NULL;

-- Topstep account names commonly encode the funded/combine nominal size.
-- Preserve an initial balance where it can be inferred safely, so RP&L can be
-- derived from Account/search balance even when the API does not send RP&L.
UPDATE public.accounts
SET starting_balance = 50000
WHERE external_source = 'projectx'
  AND (name ILIKE '%50K%' OR account_name ILIKE '%50K%')
  AND (starting_balance IS NULL OR starting_balance > 100000 OR starting_balance = broker_balance);

UPDATE public.accounts
SET broker_realized_pnl = broker_balance - starting_balance,
    broker_unrealized_pnl = COALESCE(broker_unrealized_pnl, 0)
WHERE external_source = 'projectx'
  AND broker_balance IS NOT NULL
  AND starting_balance IS NOT NULL
  AND broker_realized_pnl IS NULL;
