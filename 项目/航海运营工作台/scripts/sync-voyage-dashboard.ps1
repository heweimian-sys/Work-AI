param(
  [Parameter(Mandatory = $true)]
  [string]$ZipPath,
  [int]$VerifiedCandidates = 0
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("voyage-dashboard-" + [guid]::NewGuid().ToString("N"))

try {
  New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
  tar -xf $ZipPath -C $temporaryRoot
  $csv = Get-ChildItem -Path $temporaryRoot -Recurse -File -Filter "all_voyage_group_messages.csv" | Select-Object -First 1
  if (-not $csv) { throw "ZIP 中没有 all_voyage_group_messages.csv" }

  $rows = Import-Csv -LiteralPath $csv.FullName
  if (-not $rows.Count) { throw "CSV 没有有效记录" }

  $dates = $rows | ForEach-Object { [datetime]$_.msgTime }
  $start = ($dates | Measure-Object -Minimum).Minimum.ToString("yyyy-MM-dd")
  $end = ($dates | Measure-Object -Maximum).Maximum.ToString("yyyy-MM-dd")
  $groups = ($rows.group_name | Sort-Object -Unique).Count
  # 这里只同步已经由分析流程核验后的候选数；关键词命中量不能直接当成好事。
  $candidates = $VerifiedCandidates
  $updatedAt = [datetimeoffset]::Now.ToString("o")
  $sourceName = [System.IO.Path]::GetFileName($ZipPath).Replace("'", "''")

  $sql = @"
INSERT OR REPLACE INTO dashboard_snapshots (
  snapshot_id, source_name, records, groups_count, date_start, date_end,
  good_news_candidates, public_publishable, updated_at
) VALUES ('latest', '$sourceName', $($rows.Count), $groups, '$start', '$end', $candidates, 0, '$updatedAt');
"@

  $sqlPath = Join-Path $temporaryRoot "dashboard.sql"
  Set-Content -LiteralPath $sqlPath -Value $sql -Encoding utf8
  Push-Location $projectRoot
  try {
    npx wrangler d1 execute voyage-ops-workbench-db --remote --file $sqlPath --config wrangler.toml
    if ($LASTEXITCODE -ne 0) { throw "D1 同步失败" }
  } finally {
    Pop-Location
  }

  [pscustomobject]@{
    records = $rows.Count
    groups = $groups
    date_start = $start
    date_end = $end
    good_news_candidates = $candidates
    updated_at = $updatedAt
  } | ConvertTo-Json
} finally {
  if (Test-Path -LiteralPath $temporaryRoot) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}
