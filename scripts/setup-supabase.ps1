Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "Supabase project setup" -ForegroundColor Cyan
Write-Host "This script uses npx supabase. If you are not logged in, run: npx supabase login" -ForegroundColor Yellow

try {
  npx supabase --version | Out-Null
  Write-Host "found Supabase CLI through npx" -ForegroundColor Green
} catch {
  Write-Host "missing Supabase CLI through npx. Make sure Node/npm are installed, then try again." -ForegroundColor Red
  exit 1
}

$projectRef = Read-Host "Enter your Supabase PROJECT_REF"
if ([string]::IsNullOrWhiteSpace($projectRef)) {
  Write-Host "PROJECT_REF is required." -ForegroundColor Red
  exit 1
}

Write-Host "Linking Supabase project..." -ForegroundColor Cyan
npx supabase link --project-ref $projectRef
if ($LASTEXITCODE -ne 0) {
  Write-Host "Supabase link failed." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "Pushing database migrations..." -ForegroundColor Cyan
npx supabase db push
if ($LASTEXITCODE -ne 0) {
  Write-Host "Supabase db push failed." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "Supabase setup complete." -ForegroundColor Green
