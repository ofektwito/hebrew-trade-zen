-- ProjectX canTrade can be false outside trading/session conditions. Account
-- visibility in this journal is user-owned, so existing synced accounts remain
-- visible unless the user explicitly disables them later.

UPDATE public.accounts
SET is_active = true,
    updated_at = now()
WHERE external_source = 'projectx'
  AND is_active IS DISTINCT FROM true;
