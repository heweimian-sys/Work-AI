param(
    [string]$HermesHome = (Join-Path $env:LOCALAPPDATA "hermes"),
    [string]$NewsJobId = "a8208be5aacc",
    [string]$Deliver = "",
    [switch]$Apply
)

$ErrorActionPreference = "Stop"
if (-not $Apply) {
    Write-Host "将迁移 Hermes 配置、安装确定性路由插件，并配置两个 no-agent 定时任务。"
    Write-Host "实际执行: .\configure-hermes.ps1 -Apply"
    exit 0
}

python (Join-Path $PSScriptRoot "migrate_hermes_config.py") --source $PSScriptRoot --canonical-home $HermesHome

$PluginTarget = Join-Path $HermesHome "plugins\feishu-cli-router"
$ScriptsTarget = Join-Path $HermesHome "scripts"
New-Item -ItemType Directory -Force -Path $PluginTarget, $ScriptsTarget | Out-Null
Copy-Item -Force -Path (Join-Path $PSScriptRoot "hermes\plugins\feishu-cli-router\*") -Destination $PluginTarget
Copy-Item -Force -Path (Join-Path $PSScriptRoot "hermes\scripts\ai_news_digest.py") -Destination $ScriptsTarget
Copy-Item -Force -Path (Join-Path $PSScriptRoot "hermes\scripts\nightly_review.py") -Destination $ScriptsTarget

$jobText = hermes cron list --all | Out-String
$newsMatch = [regex]::Match($jobText, "(?ms)^\s{2}([a-z0-9]+) \[.*?^\s+Name:\s+(?:AI 最新项目追踪日报|AI 资讯日报（确定性脚本）).*?^\s+Deliver:\s+(\S+)")
$newsId = if ($newsMatch.Success) { $newsMatch.Groups[1].Value } else { $NewsJobId }
if (-not $Deliver -and $newsMatch.Success) { $Deliver = $newsMatch.Groups[2].Value }
if (-not $Deliver) { $Deliver = "origin" }

if ($jobText -match [regex]::Escape($newsId)) {
    hermes cron edit $newsId --script "ai_news_digest.py" --no-agent --deliver $Deliver --name "AI 资讯日报（确定性脚本）"
} else {
    hermes cron create "0 9 * * *" --name "AI 资讯日报（确定性脚本）" --script "ai_news_digest.py" --no-agent --deliver $Deliver
}

$reviewMatch = [regex]::Match($jobText, "(?ms)^\s{2}([a-z0-9]+) \[.*?^\s+Name:\s+每晚工作复盘（候选记忆）")
if ($reviewMatch.Success) {
    hermes cron edit $reviewMatch.Groups[1].Value --schedule "30 21 * * *" --script "nightly_review.py" --no-agent --deliver $Deliver
} else {
    hermes cron create "30 21 * * *" --name "每晚工作复盘（候选记忆）" --script "nightly_review.py" --no-agent --deliver $Deliver
}

Write-Host "Hermes 集成配置完成。请重启 Gateway 后测试固定指令。"
