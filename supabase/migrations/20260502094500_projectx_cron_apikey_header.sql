-- Supabase Edge gateway requires an apikey header for pg_net calls, even when
-- the function itself is protected by the ProjectX sync secret.

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
      'apikey', anon_key,
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
