-- Secure personal deployment: first authenticated user claims ownership, then RLS
-- restricts journal data to that owner. Supabase Edge Functions keep using the
-- service role and bypass RLS for ProjectX sync.

CREATE TABLE IF NOT EXISTS public.app_owner (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.projectx_raw_orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.projectx_raw_fills ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.projectx_sync_runs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.sync_status ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.trading_rules ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION public.current_app_owner_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.app_owner WHERE id = true
$$;

CREATE OR REPLACE FUNCTION public.is_app_owner()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND auth.uid() = public.current_app_owner_id()
$$;

CREATE OR REPLACE FUNCTION public.claim_personal_journal()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester UUID := auth.uid();
  owner_id UUID;
BEGIN
  IF requester IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.app_owner (id, user_id)
  VALUES (true, requester)
  ON CONFLICT (id) DO NOTHING;

  SELECT user_id INTO owner_id FROM public.app_owner WHERE id = true;

  IF owner_id <> requester THEN
    RAISE EXCEPTION 'Journal already claimed';
  END IF;

  UPDATE public.accounts SET user_id = requester WHERE user_id IS NULL;
  UPDATE public.trades SET user_id = requester WHERE user_id IS NULL;
  UPDATE public.daily_reviews SET user_id = requester WHERE user_id IS NULL;
  UPDATE public.projectx_raw_orders SET user_id = requester WHERE user_id IS NULL;
  UPDATE public.projectx_raw_fills SET user_id = requester WHERE user_id IS NULL;
  UPDATE public.projectx_sync_runs SET user_id = requester WHERE user_id IS NULL;
  UPDATE public.sync_status SET user_id = requester WHERE user_id IS NULL;
  UPDATE public.trading_rules SET user_id = requester WHERE user_id IS NULL;

  RETURN requester;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_personal_journal() TO authenticated;

ALTER TABLE public.app_owner ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screenshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projectx_raw_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projectx_raw_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projectx_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open all" ON public.accounts;
DROP POLICY IF EXISTS "open all" ON public.trades;
DROP POLICY IF EXISTS "open all" ON public.daily_reviews;
DROP POLICY IF EXISTS "open all" ON public.screenshots;
DROP POLICY IF EXISTS "open all" ON public.projectx_raw_orders;
DROP POLICY IF EXISTS "open all" ON public.projectx_raw_fills;
DROP POLICY IF EXISTS "open all" ON public.projectx_sync_runs;
DROP POLICY IF EXISTS "open all" ON public.sync_status;
DROP POLICY IF EXISTS "open all" ON public.trading_rules;
DROP POLICY IF EXISTS "open all" ON public.trade_executions;

CREATE POLICY "owner can view owner marker" ON public.app_owner
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "owner select accounts" ON public.accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owner insert accounts" ON public.accounts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner update accounts" ON public.accounts
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner delete accounts" ON public.accounts
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "owner select trades" ON public.trades
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owner insert trades" ON public.trades
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner update trades" ON public.trades
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner delete trades" ON public.trades
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "owner select daily reviews" ON public.daily_reviews
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owner insert daily reviews" ON public.daily_reviews
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner update daily reviews" ON public.daily_reviews
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner delete daily reviews" ON public.daily_reviews
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "owner select trade executions" ON public.trade_executions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trades
    WHERE trades.id = trade_executions.trade_id
      AND trades.user_id = auth.uid()
  ));

CREATE POLICY "owner select screenshots" ON public.screenshots
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.trades WHERE trades.id = screenshots.trade_id AND trades.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.daily_reviews WHERE daily_reviews.id = screenshots.review_id AND daily_reviews.user_id = auth.uid())
  );
CREATE POLICY "owner insert screenshots" ON public.screenshots
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_id AND trades.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.daily_reviews WHERE daily_reviews.id = review_id AND daily_reviews.user_id = auth.uid())
  );
CREATE POLICY "owner update screenshots" ON public.screenshots
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.trades WHERE trades.id = screenshots.trade_id AND trades.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.daily_reviews WHERE daily_reviews.id = screenshots.review_id AND daily_reviews.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_id AND trades.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.daily_reviews WHERE daily_reviews.id = review_id AND daily_reviews.user_id = auth.uid())
  );
CREATE POLICY "owner delete screenshots" ON public.screenshots
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.trades WHERE trades.id = screenshots.trade_id AND trades.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.daily_reviews WHERE daily_reviews.id = screenshots.review_id AND daily_reviews.user_id = auth.uid())
  );

CREATE POLICY "owner select raw orders" ON public.projectx_raw_orders
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owner select raw fills" ON public.projectx_raw_fills
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owner select sync runs" ON public.projectx_sync_runs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owner select sync status" ON public.sync_status
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owner select trading rules" ON public.trading_rules
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "screenshots public read" ON storage.objects;
DROP POLICY IF EXISTS "screenshots public write" ON storage.objects;
DROP POLICY IF EXISTS "screenshots public update" ON storage.objects;
DROP POLICY IF EXISTS "screenshots public delete" ON storage.objects;

UPDATE storage.buckets SET public = false WHERE id = 'screenshots';

CREATE POLICY "owner screenshot object read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "owner screenshot object insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "owner screenshot object update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'screenshots' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "owner screenshot object delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);
