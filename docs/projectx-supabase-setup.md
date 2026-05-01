# ProjectX / TopstepX Supabase Setup

This repo is intended to run against your own Supabase project. ProjectX credentials must live only in Supabase Edge Function secrets, never in frontend code or `VITE_*` variables.

## Frontend environment

Create `.env.local` with your Supabase frontend values:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

## Supabase CLI

```bash
npx supabase login
npx supabase link --project-ref MY_PROJECT_REF
npx supabase db push
```

## Edge Functions

Deploy the ProjectX functions:

```bash
npx supabase functions deploy projectx-sync
npx supabase functions deploy projectx-reconcile-day
npx supabase functions deploy projectx-health
```

Set secrets:

```bash
npx supabase secrets set PROJECTX_BASE_URL=...
npx supabase secrets set TSX_USERNAME=...
npx supabase secrets set TSX_API_KEY=...
npx supabase secrets set PROJECTX_ACCOUNT_IDS=...
npx supabase secrets set PROJECTX_SYNC_SECRET=...
npx supabase secrets set SUPABASE_URL=...
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
```

`PROJECTX_BASE_URL` is still required for the backend adapter. It should be the base URL for the ProjectX / TopstepX API gateway. If it is missing, or if `TSX_USERNAME` / `TSX_API_KEY` are missing, the Edge Function returns the safe Hebrew error `ProjectX עדיין לא הוגדר`.

For older environments, the Edge Functions still support `PROJECTX_USERNAME` and `PROJECTX_API_KEY` as fallback secret names, but new projects should use `TSX_USERNAME` and `TSX_API_KEY`.

`PROJECTX_ACCOUNT_IDS` is optional. If it is not set, `projectx-sync` authenticates server-side and uses `/api/Account/search` with `onlyActiveAccounts: true` to discover active accounts.

## Current ProjectX Adapter State

The Edge Functions, sync logging, raw storage tables, FIFO fill normalizer, and safe trade upsert flow are in place.

The live ProjectX HTTP calls are isolated in `supabase/functions/_shared/projectxClient.ts`.

Currently wired endpoints:

- `POST /api/Auth/loginKey`
- `POST /api/Account/search`
- `POST /api/Order/search`
- `POST /api/Trade/search`

Still useful from ProjectX docs or samples:

- Example order payload
- Example trade payload
- Confirmation of side enum values
- Confirmation that trade `fees` are full execution fees / commissions

## Sync Invocation

Production should call `projectx-sync` from a scheduled job or trusted backend using the `x-projectx-sync-secret` header. The frontend does not expose or send ProjectX credentials and only reads `sync_status` plus normalized `trades`.

## Automatic Sync Schedule

Automatic sync is configured through Supabase Cron (`pg_cron`) and `pg_net`.

Migration `20260502093000_projectx_scheduled_sync.sql` creates:

- `public.invoke_projectx_sync_cron()`
- `projectx-sync-market-hours`: every 5 minutes on weekdays during a broad US market-hours UTC window
- `projectx-sync-off-hours-weekday`: hourly outside that window
- `projectx-sync-weekend-reconcile`: every 3 hours on weekends for late corrections

The cron function reads only these Supabase Vault secrets:

- `projectx_project_url`
- `projectx_anon_key`
- `projectx_sync_secret`

Use the helper script to generate and set the shared sync secret and write the scheduling values into Vault without printing them:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-projectx-cron.ps1
```

Do not call `projectx-sync` from the browser. The frontend should only read `sync_status`.
