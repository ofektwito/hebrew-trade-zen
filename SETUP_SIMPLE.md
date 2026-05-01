# Simple Windows Setup

This is the short setup flow for your own Supabase project.

Do not put `TSX_USERNAME` or `TSX_API_KEY` in frontend code. Keep them in local `.env` only for setup, and in Supabase secrets for deployed Edge Functions.

## Step 1: Edit `.env`

Create or update `.env`:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
TSX_USERNAME=
TSX_API_KEY=
PROJECTX_BASE_URL=
```

`PROJECTX_BASE_URL` is required by the backend ProjectX / TopstepX adapter.

## Step 2: Check env

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-env.ps1
```

The script prints only `found` / `missing`. It does not print secret values.

## Step 3: Link Supabase and push migrations

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-supabase.ps1
```

The script will ask for your Supabase `PROJECT_REF`, then run:

```powershell
npx supabase link --project-ref PROJECT_REF
npx supabase db push
```

If you are not logged in yet, run this first:

```powershell
npx supabase login
```

## Step 4: Deploy Edge Functions

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-functions.ps1
```

This deploys:

- `projectx-sync`
- `projectx-reconcile-day`
- `projectx-health`

## Step 5: Set Supabase secrets safely

Set secrets in Supabase. Do not commit secrets.

```powershell
npx supabase secrets set PROJECTX_BASE_URL="..."
npx supabase secrets set TSX_USERNAME="..."
npx supabase secrets set TSX_API_KEY="..."
npx supabase secrets set PROJECTX_SYNC_SECRET="..."
npx supabase secrets set SUPABASE_URL="..."
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY="..."
```

`PROJECTX_ACCOUNT_IDS` is optional. If you do not set it, the backend uses ProjectX account search to discover active accounts after authentication.

Helper example for setting secrets from local `.env` without printing values:

```powershell
$envLines = Get-Content .env | Where-Object { $_ -match "^[A-Za-z_][A-Za-z0-9_]*=" }
foreach ($line in $envLines) {
  $name, $value = $line -split "=", 2
  if ($name -in @("PROJECTX_BASE_URL", "TSX_USERNAME", "TSX_API_KEY")) {
    npx supabase secrets set "$name=$value"
  }
}
```

You still need to set `PROJECTX_SYNC_SECRET`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
