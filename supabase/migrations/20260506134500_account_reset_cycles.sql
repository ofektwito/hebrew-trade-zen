ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS account_group_id uuid,
  ADD COLUMN IF NOT EXISTS cycle_number integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cycle_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS reset_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS reset_reason text;

UPDATE public.accounts
SET account_group_id = COALESCE(account_group_id, id),
    cycle_number = COALESCE(cycle_number, 1),
    cycle_status = COALESCE(
      cycle_status,
      CASE
        WHEN COALESCE(is_archived, false) THEN 'archived'
        WHEN account_status IN ('failed', 'archived') THEN account_status
        ELSE 'active'
      END
    ),
    started_at = COALESCE(started_at, created_at)
WHERE account_group_id IS NULL
   OR cycle_number IS NULL
   OR cycle_status IS NULL
   OR started_at IS NULL;

DROP INDEX IF EXISTS idx_accounts_external_account;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_external_account_current_cycle
  ON public.accounts (external_source, external_account_id)
  WHERE external_account_id IS NOT NULL
    AND COALESCE(is_archived, false) = false
    AND COALESCE(cycle_status, 'active') = 'active';

CREATE INDEX IF NOT EXISTS accounts_account_group_id_idx ON public.accounts(account_group_id);
CREATE INDEX IF NOT EXISTS accounts_cycle_status_idx ON public.accounts(cycle_status);
