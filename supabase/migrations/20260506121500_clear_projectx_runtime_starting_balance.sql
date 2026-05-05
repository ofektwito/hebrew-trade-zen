-- Earlier prototype syncs wrote the ProjectX Account/search balance into
-- starting_balance. For accounts where the account name does not reveal a
-- funded/evaluation nominal size, keep starting_balance empty instead of
-- treating a live broker-reported value as the starting balance.
UPDATE public.accounts
SET starting_balance = NULL
WHERE external_source = 'projectx'
  AND starting_balance = broker_balance
  AND COALESCE(name, account_name, '') NOT ILIKE '%50K%'
  AND COALESCE(name, account_name, '') NOT ILIKE '%100K%'
  AND COALESCE(name, account_name, '') NOT ILIKE '%150K%';
