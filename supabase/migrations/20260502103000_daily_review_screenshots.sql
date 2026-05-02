-- Support screenshots that belong to a daily review, while preserving existing
-- trade screenshots.

ALTER TABLE public.screenshots
  ADD COLUMN IF NOT EXISTS review_id UUID REFERENCES public.daily_reviews(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS screenshot_context TEXT;

ALTER TABLE public.screenshots
  ALTER COLUMN trade_id DROP NOT NULL;

ALTER TABLE public.screenshots
  DROP CONSTRAINT IF EXISTS screenshots_kind_check;

ALTER TABLE public.screenshots
  DROP CONSTRAINT IF EXISTS screenshots_owner_check;

ALTER TABLE public.screenshots
  ADD CONSTRAINT screenshots_owner_check
  CHECK (
    (trade_id IS NOT NULL AND review_id IS NULL)
    OR
    (trade_id IS NULL AND review_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_screenshots_review ON public.screenshots(review_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_context ON public.screenshots(screenshot_context);
