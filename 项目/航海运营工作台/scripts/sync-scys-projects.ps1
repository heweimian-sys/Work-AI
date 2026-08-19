param([string]$JsonPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "examples\scys-projects.public.json"))
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$payload = Get-Content -LiteralPath $JsonPath -Raw | ConvertFrom-Json
$projectsJson = ($payload.projects | ConvertTo-Json -Depth 8 -Compress).Replace("'", "''")
$updatedAt = if ($payload.dataAsOf -is [datetime]) { $payload.dataAsOf.ToString("o") } else { [string]$payload.dataAsOf }
$updatedAt = $updatedAt.Replace("'", "''")
$temporarySql = Join-Path ([System.IO.Path]::GetTempPath()) ("scys-projects-" + [guid]::NewGuid().ToString("N") + ".sql")
try {
  Set-Content -LiteralPath $temporarySql -Encoding utf8 -Value "UPDATE dashboard_snapshots SET scys_projects_json='$projectsJson', scys_updated_at='$updatedAt' WHERE snapshot_id='latest';"
  Push-Location $projectRoot
  try {
    npx wrangler d1 execute voyage-ops-workbench-db --remote --file $temporarySql --config wrangler.toml
    if ($LASTEXITCODE -ne 0) { throw "生财项目聚合同步失败" }
  } finally { Pop-Location }
  [pscustomobject]@{ projects = @($payload.projects).Count; updated_at = $updatedAt } | ConvertTo-Json
} finally { Remove-Item -LiteralPath $temporarySql -Force -ErrorAction SilentlyContinue }
