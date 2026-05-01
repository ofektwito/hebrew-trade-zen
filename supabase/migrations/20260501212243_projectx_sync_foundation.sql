-- Independent trading journal schema foundation for ProjectX/TopstepX sync.
-- This migration is intentionally additive so the current MVP keeps working.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS account_name TEXT,
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_account_id TEXT,
  ADD COLUMN IF NOT EXISTS account_type TEXT,
  ADD COLUMN IF NOT EXISTS daily_loss_limit NUMERIC DEFAULT 350,
  ADD COLUMN IF NOT EXISTS max_loss_limit NUMERIC,
  ADD COLUMN IF NOT EXISTS commission_per_contract NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_status TEXT,
  ADD COLUMN IF NOT EXISTS sync_error TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.accounts
SET account_name = COALESCE(account_name, name),
    broker = COALESCE(broker, 'projectx')
WHERE account_name IS NULL OR broker IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_external_account
  ON public.accounts (external_source, external_account_id)
  WHERE external_account_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_accounts_updated ON public.accounts;
CREATE TRIGGER trg_accounts_updated BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_trade_id TEXT,
  ADD COLUMN IF NOT EXISTS external_account_id TEXT,
  ADD COLUMN IF NOT EXISTS sync_hash TEXT,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS entry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exit_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS size NUMERIC,
  ADD COLUMN IF NOT EXISTS catalyst_manual_override BOOLEAN DEFAULT false;

UPDATE public.trades
SET source = COALESCE(source, 'manual'),
    size = COALESCE(size, position_size)
WHERE source IS NULL OR size IS NULL;

CREATE INDEX IF NOT EXISTS idx_trades_account ON public.trades(account_id);
CREATE INDEX IF NOT EXISTS idx_trades_source ON public.trades(source);
CREATE INDEX IF NOT EXISTS idx_trades_external_source ON public.trades(external_source);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_external_trade_unique
  ON public.trades (external_source, external_trade_id)
  WHERE external_trade_id IS NOT NULL;

ALTER TABLE public.screenshots
  ADD COLUMN IF NOT EXISTS screenshot_type TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS public_url TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ;

UPDATE public.screenshots
SET screenshot_type = COALESCE(screenshot_type, kind),
    public_url = COALESCE(public_url, url),
    uploaded_at = COALESCE(uploaded_at, created_at)
WHERE screenshot_type IS NULL OR public_url IS NULL OR uploaded_at IS NULL;

ALTER TABLE public.daily_reviews
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS what_i_did_well TEXT,
  ADD COLUMN IF NOT EXISTS what_i_did_wrong TEXT,
  ADD COLUMN IF NOT EXISTS main_lesson TEXT,
  ADD COLUMN IF NOT EXISTS should_reduce_size_tomorrow BOOLEAN,
  ADD COLUMN IF NOT EXISTS emotional_control_score INTEGER,
  ADD COLUMN IF NOT EXISTS final_takeaway TEXT,
  ADD COLUMN IF NOT EXISTS questions_for_chatgpt TEXT;

UPDATE public.daily_reviews
SET what_i_did_well = COALESCE(what_i_did_well, did_well),
    what_i_did_wrong = COALESCE(what_i_did_wrong, did_wrong),
    main_lesson = COALESCE(main_lesson, lessons),
    should_reduce_size_tomorrow = COALESCE(should_reduce_size_tomorrow, reduce_size_tomorrow),
    emotional_control_score = COALESCE(emotional_control_score, emotional_score),
    final_takeaway = COALESCE(final_takeaway, final_summary)
WHERE what_i_did_well IS NULL
   OR what_i_did_wrong IS NULL
   OR main_lesson IS NULL
   OR should_reduce_size_tomorrow IS NULL
   OR emotional_control_score IS NULL
   OR final_takeaway IS NULL;

CREATE TABLE IF NOT EXISTS public.projectx_raw_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_order_id TEXT,
  external_account_id TEXT,
  platform_order_id TEXT,
  exchange_order_id TEXT,
  contract_name TEXT,
  status TEXT,
  type TEXT,
  side TEXT,
  size NUMERIC,
  created_at_projectx TIMESTAMPTZ,
  filled_at_projectx TIMESTAMPTZ,
  trade_day DATE,
  execute_price NUMERIC,
  stop_price NUMERIC,
  limit_price NUMERIC,
  position_disposition TEXT,
  creation_disposition TEXT,
  rejection_reason TEXT,
  raw_payload JSONB NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_projectx_raw_orders_external_order
  ON public.projectx_raw_orders(external_order_id)
  WHERE external_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projectx_raw_orders_platform_order
  ON public.projectx_raw_orders(platform_order_id)
  WHERE platform_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projectx_raw_orders_trade_day ON public.projectx_raw_orders(trade_day);

CREATE TABLE IF NOT EXISTS public.projectx_raw_fills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_fill_id TEXT,
  external_order_id TEXT,
  external_account_id TEXT,
  contract_name TEXT,
  side TEXT,
  size NUMERIC,
  price NUMERIC,
  fill_time TIMESTAMPTZ,
  commission NUMERIC,
  raw_payload JSONB NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_projectx_raw_fills_external_fill
  ON public.projectx_raw_fills(external_fill_id)
  WHERE external_fill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projectx_raw_fills_account_contract_time
  ON public.projectx_raw_fills(external_account_id, contract_name, fill_time);

CREATE TABLE IF NOT EXISTS public.projectx_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  range_start TIMESTAMPTZ,
  range_end TIMESTAMPTZ,
  accounts_synced INTEGER DEFAULT 0,
  orders_count INTEGER DEFAULT 0,
  fills_count INTEGER DEFAULT 0,
  trades_upserted INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sync_status (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'ok',
  last_success_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  message TEXT,
  is_reconnecting BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.sync_status (id, status, message)
VALUES ('projectx', 'error', 'ProjectX adapter requires endpoint configuration')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.trading_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.trading_rules (title, description)
VALUES
  ('אחרי Catalyst משמעותי', 'אם השוק כבר עשה מהלך חזק — מקסימום חוזה אחד עד שיש אישור המשך ברור.'),
  ('הפסד ראשון אחרי חדשות', 'אם הפסדתי טרייד ראשון אחרי חדשות — הפסקה של 10 דקות.'),
  ('החלפת כיוון מהירה', 'אם החלפתי כיוון פעמיים בתוך 10 דקות — מפסיקים לסחור.'),
  ('סטופ יומי', 'אם הגעתי לסטופ יומי — היום נגמר.')
ON CONFLICT DO NOTHING;

ALTER TABLE public.projectx_raw_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projectx_raw_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projectx_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_rules ENABLE ROW LEVEL SECURITY;

-- Personal prototype policies. TODO(auth): replace with user_id ownership policies.
CREATE POLICY "open all" ON public.projectx_raw_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open all" ON public.projectx_raw_fills FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open all" ON public.projectx_sync_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open all" ON public.sync_status FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open all" ON public.trading_rules FOR ALL USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('screenshots', 'screenshots', true)
ON CONFLICT (id) DO NOTHING;
