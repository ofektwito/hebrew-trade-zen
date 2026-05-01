Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot ".env"

$requiredKeys = @(
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "TSX_USERNAME",
  "TSX_API_KEY",
  "PROJECTX_BASE_URL"
)

Write-Host "Checking local .env configuration..." -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $envPath)) {
  Write-Host "missing .env" -ForegroundColor Red
  exit 1
}

Write-Host "found .env" -ForegroundColor Green

$foundKeys = @{}
Get-Content -LiteralPath $envPath | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) {
    return
  }

  $separatorIndex = $line.IndexOf("=")
  if ($separatorIndex -le 0) {
    return
  }

  $key = $line.Substring(0, $separatorIndex).Trim()
  $value = $line.Substring($separatorIndex + 1).Trim()
  $foundKeys[$key] = ($value.Length -gt 0)
}

$missing = @()
foreach ($key in $requiredKeys) {
  if ($foundKeys.ContainsKey($key) -and $foundKeys[$key]) {
    Write-Host "found $key" -ForegroundColor Green
  } else {
    Write-Host "missing $key" -ForegroundColor Red
    $missing += $key
  }
}

if ($missing.Count -gt 0) {
  Write-Host "Environment check failed. Add the missing keys to .env and run again." -ForegroundColor Red
  exit 1
}

Write-Host "Environment check passed." -ForegroundColor Green

