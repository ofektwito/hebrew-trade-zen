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

## Current ProjectX Adapter State

The Edge Functions, sync logging, raw storage tables, FIFO fill normalizer, and safe trade upsert flow are in place.

The live ProjectX HTTP calls are intentionally isolated in `supabase/functions/_shared/projectxClient.ts`. They currently return a clear configuration error until the exact ProjectX endpoint paths and response shapes are provided.

Needed from ProjectX docs or samples:

- Auth endpoint path and request/response shape
- Orders endpoint path and query parameters
- Fills endpoint path and query parameters
- Account endpoint path and account identifiers
- Example order payload
- Example fill payload
- Commission fields, if available

## Sync Invocation

Production should call `projectx-sync` from a scheduled job or trusted backend using the `x-projectx-sync-secret` header. The frontend does not expose or send ProjectX credentials and only reads `sync_status` plus normalized `trades`.
