ALTER TABLE public.daily_reviews
  ADD COLUMN IF NOT EXISTS daily_summary TEXT,
  ADD COLUMN IF NOT EXISTS market_state TEXT,
  ADD COLUMN IF NOT EXISTS daily_loss_limit_hit BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS overtraded BOOLEAN DEFAULT false;
