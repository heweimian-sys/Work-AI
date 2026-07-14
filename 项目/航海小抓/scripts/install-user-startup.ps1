$ErrorActionPreference = "Stop"
$Project = Resolve-Path (Join-Path $PSScriptRoot "..")
$WatchScript = Join-Path $Project "scripts\watch-bot-startup.ps1"
if (-not (Test-Path $WatchScript)) {
  throw "watch script not found: $WatchScript"
}

$StartupDir = [Environment]::GetFolderPath("Startup")
$StartupFile = Join-Path $StartupDir "FeishuKbBot.cmd"
$Content = "@echo off`r`nstart `"FeishuKbBot`" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$WatchScript`"`r`n"
Set-Content -LiteralPath $StartupFile -Value $Content -Encoding ASCII
Write-Host "OK: startup file installed: $StartupFile"
Write-Host "It will run when this Windows user logs in."
Write-Host "Start now: npm.cmd run bot:watch"
Write-Host "Monitor: npm.cmd run bot:monitor"
