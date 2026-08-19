param(
  [Parameter(Mandatory = $true)]
  [string]$ZipPath,
  [int]$VerifiedCandidates = 0,
  [int]$DetectedCandidates = 0,
  [string]$GoodNewsBreakdownJson = "[]",
  [string]$AnalysisStatus = "internal_summary"
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
  $groupNames = @($rows.group_name | Sort-Object -Unique)
  $groups = $groupNames.Count
  # 这里只同步已经由分析流程核验后的候选数；关键词命中量不能直接当成好事。
  $candidates = $VerifiedCandidates
  if ($DetectedCandidates -lt $candidates) { $DetectedCandidates = $candidates }
  $updatedAt = [datetimeoffset]::Now.ToString("o")
  $sourceName = "approved-voyage-aggregate"
  $sourceChecksum = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $dailyTrends = @($rows | Group-Object { ([datetime]$_.msgTime).ToString("yyyy-MM-dd") } | Sort-Object Name | ForEach-Object {
    [ordered]@{ date = $_.Name; messages = $_.Count; active_groups = @($_.Group.group_name | Sort-Object -Unique).Count }
  })
  $activeGroups = @($rows | Group-Object group_name | Sort-Object Count -Descending | Select-Object -First 10 | ForEach-Object -Begin { $rank = 0 } -Process {
    $rank += 1
    [ordered]@{ group = "活跃群组 " + $rank.ToString("00"); messages = $_.Count }
  })
  $projectOverview = [ordered]@{
    title = "2026 年 8 月航海总览"
    summary = "已完成匿名聚合分析，好事候选仍需人工核验后才可公开。"
    coverage = "$groups / $groups"
  }
  $aggregateReport = [ordered]@{
    title = "航海聚合日报"
    main_line = "已完成消息趋势、群组活跃度和时间范围统计。"
    data_status = "聚合完成，候选内容待核验"
  }
  $dailyJson = ($dailyTrends | ConvertTo-Json -Depth 5 -Compress).Replace("'", "''")
  $groupsJson = ($activeGroups | ConvertTo-Json -Depth 5 -Compress).Replace("'", "''")
  $overviewJson = ($projectOverview | ConvertTo-Json -Depth 5 -Compress).Replace("'", "''")
  $reportJson = ($aggregateReport | ConvertTo-Json -Depth 5 -Compress).Replace("'", "''")
  $safeStatus = $AnalysisStatus.Replace("'", "''")
  $safeBreakdown = $GoodNewsBreakdownJson.Replace("'", "''")

  $sql = @"
INSERT OR REPLACE INTO dashboard_snapshots (
  snapshot_id, source_name, records, groups_count, date_start, date_end,
  good_news_candidates, good_news_detected, good_news_breakdown_json, good_news_reviewed_at,
  public_publishable, updated_at, source_checksum,
  analysis_status, daily_trends_json, active_groups_json,
  project_overview_json, aggregate_report_json
) VALUES ('latest', '$sourceName', $($rows.Count), $groups, '$start', '$end', $candidates, $DetectedCandidates,
  '$safeBreakdown', '$updatedAt', 0, '$updatedAt',
  '$sourceChecksum', '$safeStatus', '$dailyJson', '$groupsJson', '$overviewJson', '$reportJson');
"@

  $sqlPath = Join-Path $temporaryRoot "dashboard.sql"
  Set-Content -LiteralPath $sqlPath -Value $sql -Encoding utf8
  Push-Location $projectRoot
  try {
    $migration = Join-Path $projectRoot "drizzle\0002_dashboard_details.sql"
    $goodNewsMigration = Join-Path $projectRoot "drizzle\0004_good_news_review.sql"
    $nativePreference = $PSNativeCommandUseErrorActionPreference
    $PSNativeCommandUseErrorActionPreference = $false
    npx wrangler d1 execute voyage-ops-workbench-db --remote --file $migration --config wrangler.toml *> $null
    npx wrangler d1 execute voyage-ops-workbench-db --remote --file $goodNewsMigration --config wrangler.toml *> $null
    $PSNativeCommandUseErrorActionPreference = $nativePreference
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
    source_checksum = $sourceChecksum
    analysis_status = $AnalysisStatus
    daily_trends = $dailyTrends
    active_groups = $activeGroups
    updated_at = $updatedAt
  } | ConvertTo-Json
} finally {
  if (Test-Path -LiteralPath $temporaryRoot) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}
