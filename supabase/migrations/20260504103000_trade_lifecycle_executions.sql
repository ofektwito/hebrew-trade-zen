-- Position-lifecycle trade grouping for ProjectX/TopstepX.
-- Raw ProjectX fills remain intact. Journal trades can now have auditable execution legs.

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS max_position_size NUMERIC,
  ADD COLUMN IF NOT EXISTS total_opened_size NUMERIC,
  ADD COLUMN IF NOT EXISTS executions_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES public.trades(id),
  ADD COLUMN IF NOT EXISTS superseded_reason TEXT,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

UPDATE public.trades
SET max_position_size = COALESCE(max_position_size, position_size, size),
    total_opened_size = COALESCE(total_opened_size, size, position_size),
    executions_count = COALESCE(executions_count, 0)
WHERE max_position_size IS NULL
   OR total_opened_size IS NULL
   OR executions_count IS NULL;

CREATE INDEX IF NOT EXISTS idx_trades_superseded_by ON public.trades(superseded_by);
CREATE INDEX IF NOT EXISTS idx_trades_active_projectx_date
  ON public.trades(source, trade_date)
  WHERE superseded_by IS NULL;

CREATE TABLE IF NOT EXISTS public.trade_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  external_execution_id TEXT,
  external_order_id TEXT,
  account_id UUID REFERENCES public.accounts(id),
  external_account_id TEXT,
  contract_name TEXT,
  side TEXT,
  execution_role TEXT,
  size NUMERIC,
  price NUMERIC,
  executed_at TIMESTAMPTZ,
  commissions NUMERIC,
  fees NUMERIC,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trade_executions_external_execution
  ON public.trade_executions(external_execution_id)
  WHERE external_execution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trade_executions_trade_id ON public.trade_executions(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_executions_executed_at ON public.trade_executions(executed_at);
CREATE INDEX IF NOT EXISTS idx_trade_executions_contract_name ON public.trade_executions(contract_name);

ALTER TABLE public.trade_executions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trade_executions'
      AND policyname = 'open all'
  ) THEN
    CREATE POLICY "open all" ON public.trade_executions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON COLUMN public.trades.max_position_size IS
  'Maximum open contracts reached during the position lifecycle. This is the journal trade size shown in the UI.';
COMMENT ON COLUMN public.trades.total_opened_size IS
  'Total contracts opened through initial entry and adds during the lifecycle.';
COMMENT ON COLUMN public.trades.superseded_by IS
  'Old ProjectX pair-level trades replaced by a grouped lifecycle journal trade. Kept for audit and qualitative preservation.';
