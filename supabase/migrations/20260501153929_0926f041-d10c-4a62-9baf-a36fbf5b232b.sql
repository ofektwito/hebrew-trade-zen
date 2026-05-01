-- Accounts
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  broker TEXT,
  starting_balance NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trades
CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_date DATE NOT NULL,
  entry_time TIME,
  exit_time TIME,
  account_name TEXT,
  instrument TEXT NOT NULL,
  contract_name TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('Long','Short')),
  position_size NUMERIC NOT NULL DEFAULT 1,
  entry_price NUMERIC,
  exit_price NUMERIC,
  stop_price NUMERIC,
  target_price NUMERIC,
  gross_pnl NUMERIC,
  commissions NUMERIC DEFAULT 0,
  net_pnl NUMERIC,
  points NUMERIC,
  order_type TEXT,
  catalyst TEXT,
  market_condition TEXT,
  setup_type TEXT,
  trade_quality TEXT,
  followed_plan TEXT CHECK (followed_plan IN ('Yes','Partially','No')),
  mistake_type TEXT,
  emotional_state TEXT,
  notes TEXT,
  lesson TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trades_date ON public.trades(trade_date DESC);

-- Daily reviews
CREATE TABLE public.daily_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_date DATE NOT NULL UNIQUE,
  total_pnl NUMERIC,
  trades_count INTEGER,
  best_trade TEXT,
  worst_trade TEXT,
  main_catalyst TEXT,
  market_context TEXT,
  did_well TEXT,
  did_wrong TEXT,
  lessons TEXT,
  rule_for_tomorrow TEXT,
  reduce_size_tomorrow BOOLEAN DEFAULT false,
  discipline_score INTEGER CHECK (discipline_score BETWEEN 1 AND 10),
  execution_score INTEGER CHECK (execution_score BETWEEN 1 AND 10),
  emotional_score INTEGER CHECK (emotional_score BETWEEN 1 AND 10),
  final_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Screenshots
CREATE TABLE public.screenshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('entry','exit','post')),
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_screenshots_trade ON public.screenshots(trade_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_trades_updated BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_reviews_updated BEFORE UPDATE ON public.daily_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS - personal app, open access
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screenshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open all" ON public.accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open all" ON public.trades FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open all" ON public.daily_reviews FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open all" ON public.screenshots FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('screenshots','screenshots',true);

CREATE POLICY "screenshots public read" ON storage.objects FOR SELECT USING (bucket_id = 'screenshots');
CREATE POLICY "screenshots public write" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'screenshots');
CREATE POLICY "screenshots public update" ON storage.objects FOR UPDATE USING (bucket_id = 'screenshots');
CREATE POLICY "screenshots public delete" ON storage.objects FOR DELETE USING (bucket_id = 'screenshots');