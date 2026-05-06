ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS is_current_account boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_in_main_selector boolean DEFAULT false;

UPDATE public.accounts
SET is_current_account = false,
    show_in_main_selector = false
WHERE external_source = 'projectx';

UPDATE public.accounts
SET is_current_account = true,
    show_in_main_selector = true,
    is_archived = false,
    cycle_status = COALESCE(NULLIF(cycle_status, 'archived'), 'active'),
    account_status = COALESCE(account_status, 'unknown')
WHERE external_source = 'projectx'
  AND name IN (
    '50KTC-V2-463968-95250022',
    'EXPRESS-V2-DLL-463968-21898534'
  );

CREATE INDEX IF NOT EXISTS accounts_is_current_account_idx ON public.accounts(is_current_account);
CREATE INDEX IF NOT EXISTS accounts_show_in_main_selector_idx ON public.accounts(show_in_main_selector);
