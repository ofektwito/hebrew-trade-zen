-- Automatic ProjectX sync scheduling.
--
-- Supabase scheduled functions are implemented with pg_cron + pg_net.
-- Secrets used by Postgres cron live in Supabase Vault and are set by
-- scripts/setup-projectx-cron.ps1. No ProjectX credentials are stored here.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

CREATE OR REPLACE FUNCTION public.invoke_projectx_sync_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault
AS $$
DECLARE
  project_url text;
  anon_key text;
  sync_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret
    INTO project_url
  FROM vault.decrypted_secrets
  WHERE name = 'projectx_project_url'
  LIMIT 1;

  SELECT decrypted_secret
    INTO anon_key
  FROM vault.decrypted_secrets
  WHERE name = 'projectx_anon_key'
  LIMIT 1;

  SELECT decrypted_secret
    INTO sync_secret
  FROM vault.decrypted_secrets
  WHERE name = 'projectx_sync_secret'
  LIMIT 1;

  IF project_url IS NULL OR anon_key IS NULL OR sync_secret IS NULL THEN
    INSERT INTO public.sync_status (id, status, last_attempt_at, message, is_reconnecting, updated_at)
    VALUES (
      'projectx',
      'error',
      now(),
      'Automatic ProjectX sync is not configured in Supabase Vault',
      false,
      now()
    )
    ON CONFLICT (id) DO UPDATE
      SET status = EXCLUDED.status,
          last_attempt_at = EXCLUDED.last_attempt_at,
          message = EXCLUDED.message,
          is_reconnecting = EXCLUDED.is_reconnecting,
          updated_at = EXCLUDED.updated_at;
    RETURN;
  END IF;

  SELECT net.http_post(
    url := project_url || '/functions/v1/projectx-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'x-projectx-sync-secret', sync_secret
    ),
    body := jsonb_build_object(
      'rangeStart', (now() - interval '7 days'),
      'rangeEnd', now()
    ),
    timeout_milliseconds := 30000
  )
  INTO request_id;
END;
$$;

COMMENT ON FUNCTION public.invoke_projectx_sync_cron()
IS 'Invokes projectx-sync from pg_cron using Supabase Vault secrets. Preserves qualitative trade fields because projectx-sync only upserts quantitative broker fields.';

-- Idempotently replace ProjectX cron jobs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'projectx-sync-market-hours') THEN
    PERFORM cron.unschedule('projectx-sync-market-hours');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'projectx-sync-off-hours-weekday') THEN
    PERFORM cron.unschedule('projectx-sync-off-hours-weekday');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'projectx-sync-weekend-reconcile') THEN
    PERFORM cron.unschedule('projectx-sync-weekend-reconcile');
  END IF;
END $$;

-- Broad UTC window covering US regular trading hours across DST shifts.
SELECT cron.schedule(
  'projectx-sync-market-hours',
  '*/5 13-21 * * 1-5',
  'SELECT public.invoke_projectx_sync_cron();'
);

-- Lighter reconciliation outside the broad US market window.
SELECT cron.schedule(
  'projectx-sync-off-hours-weekday',
  '17 0-12,22-23 * * 1-5',
  'SELECT public.invoke_projectx_sync_cron();'
);

-- Weekend/closed-market reconciliation for late corrections.
SELECT cron.schedule(
  'projectx-sync-weekend-reconcile',
  '17 */3 * * 0,6',
  'SELECT public.invoke_projectx_sync_cron();'
);
