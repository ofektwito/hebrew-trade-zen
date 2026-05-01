Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$functions = @(
  "projectx-sync",
  "projectx-reconcile-day",
  "projectx-health"
)

Write-Host "Deploying Supabase Edge Functions..." -ForegroundColor Cyan

foreach ($functionName in $functions) {
  Write-Host "Deploying $functionName..." -ForegroundColor Cyan
  npx supabase functions deploy $functionName
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Deploy failed for $functionName." -ForegroundColor Red
    exit $LASTEXITCODE
  }
}

Write-Host "Edge Function deployment complete." -ForegroundColor Green
