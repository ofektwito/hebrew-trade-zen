Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot ".env"

function Read-DotEnv {
  param([string]$Path)

  $values = @{}
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) {
      return
    }

    $separatorIndex = $line.IndexOf("=")
    if ($separatorIndex -le 0) {
      return
    }

    $key = $line.Substring(0, $separatorIndex).Trim()
    $value = $line.Substring($separatorIndex + 1).Trim().Trim('"').Trim("'")
    $values[$key] = $value
  }

  return $values
}

function New-StrongSecret {
  $bytes = New-Object byte[] 48
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($bytes)
}

function SqlLiteral {
  param([string]$Value)
  return "'" + $Value.Replace("'", "''") + "'"
}

Write-Host "Configuring ProjectX scheduled sync..." -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $envPath)) {
  Write-Host "missing .env" -ForegroundColor Red
  exit 1
}

$envValues = Read-DotEnv -Path $envPath
$required = @("VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY")
$missing = @()
foreach ($key in $required) {
  if (-not $envValues.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($envValues[$key])) {
    $missing += $key
  }
}

if ($missing.Count -gt 0) {
  foreach ($key in $missing) {
    Write-Host "missing $key" -ForegroundColor Red
  }
  exit 1
}

$projectUrl = $envValues["VITE_SUPABASE_URL"].TrimEnd("/") -replace "/rest/v1$", ""
$anonKey = $envValues["VITE_SUPABASE_PUBLISHABLE_KEY"]
$syncSecret = New-StrongSecret

Write-Host "Setting Edge Function sync secret..." -ForegroundColor Cyan
npx supabase secrets set "PROJECTX_SYNC_SECRET=$syncSecret" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to set PROJECTX_SYNC_SECRET."
}

$tempSql = Join-Path ([System.IO.Path]::GetTempPath()) ("projectx-cron-vault-" + [guid]::NewGuid().ToString("N") + ".sql")

try {
  $projectUrlSql = SqlLiteral $projectUrl
  $anonKeySql = SqlLiteral $anonKey
  $syncSecretSql = SqlLiteral $syncSecret

  $sql = @"
DELETE FROM vault.secrets
WHERE name IN ('projectx_project_url', 'projectx_anon_key', 'projectx_sync_secret');

SELECT vault.create_secret($projectUrlSql, 'projectx_project_url', 'Supabase project URL for scheduled ProjectX sync');
SELECT vault.create_secret($anonKeySql, 'projectx_anon_key', 'Supabase publishable key for scheduled ProjectX sync');
SELECT vault.create_secret($syncSecretSql, 'projectx_sync_secret', 'Shared secret for scheduled ProjectX sync');
"@

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($tempSql, $sql, $utf8NoBom)

  Write-Host "Writing scheduling secrets to Supabase Vault..." -ForegroundColor Cyan
  npx supabase db query --linked --file $tempSql | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to write scheduling secrets to Supabase Vault."
  }
} finally {
  if (Test-Path -LiteralPath $tempSql) {
    Remove-Item -LiteralPath $tempSql -Force
  }
}

Write-Host "ProjectX scheduled sync secrets are configured." -ForegroundColor Green
