param(
  [string]$JsonPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "examples\scys-ops-dashboard.public.json"),
  [switch]$ValidateOnly,
  [switch]$Local
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$projectionScript = Join-Path $PSScriptRoot "project-scys-public.mjs"
$migration = Join-Path $projectRoot "drizzle\0006_scys_ops_snapshots.sql"
$temporaryJson = Join-Path ([System.IO.Path]::GetTempPath()) ("scys-projection-" + [guid]::NewGuid().ToString("N") + ".json")
$temporarySql = Join-Path ([System.IO.Path]::GetTempPath()) ("scys-snapshot-" + [guid]::NewGuid().ToString("N") + ".sql")

try {
  $projectionOutput = & node $projectionScript $JsonPath $temporaryJson
  if ($LASTEXITCODE -ne 0) { throw "MCP snapshot allowlist projection failed" }
  $validationResult = $projectionOutput | ConvertFrom-Json
  if ($ValidateOnly) {
    $validationResult | ConvertTo-Json
    return
  }

  $safePayload = Get-Content -LiteralPath $temporaryJson -Raw -Encoding UTF8 | ConvertFrom-Json
  $opsJson = (Get-Content -LiteralPath $temporaryJson -Raw -Encoding UTF8).Replace("'", "''")
  $updatedAt = ([string]$safePayload.retrievedAt).Replace("'", "''")
  $sql = @"
INSERT INTO scys_ops_snapshots (snapshot_id, source_mode, ops_json, updated_at)
VALUES ('latest', 'scys_mcp_only', '$opsJson', '$updatedAt')
ON CONFLICT(snapshot_id) DO UPDATE SET
  source_mode = excluded.source_mode,
  ops_json = excluded.ops_json,
  updated_at = excluded.updated_at;
"@
  Set-Content -LiteralPath $temporarySql -Encoding utf8 -Value $sql

  Push-Location $projectRoot
  try {
    $deploymentTarget = if ($Local) { "--local" } else { "--remote" }
    npx wrangler d1 execute voyage-ops-workbench-db $deploymentTarget --file $migration --config wrangler.toml
    if ($LASTEXITCODE -ne 0) { throw "MCP-only D1 table initialization failed" }
    npx wrangler d1 execute voyage-ops-workbench-db $deploymentTarget --file $temporarySql --config wrangler.toml
    if ($LASTEXITCODE -ne 0) { throw "MCP project aggregate sync failed" }
  } finally {
    Pop-Location
  }

  $validationResult | ConvertTo-Json
} finally {
  Remove-Item -LiteralPath $temporaryJson -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $temporarySql -Force -ErrorAction SilentlyContinue
}
