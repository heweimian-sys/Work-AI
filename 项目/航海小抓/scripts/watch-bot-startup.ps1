$ErrorActionPreference = "Continue"
$Project = "C:\Users\18786\Documents\Codex\2026-07-13\v\work\Work-AI\项目\航海小抓"
$LogDir = Join-Path $Project "logs"
$LogFile = Join-Path $LogDir "bot-autostart.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $Project
function Log($m) { "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m | Tee-Object -FilePath $LogFile -Append }
function Get-BotProcess {
  Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -like "*$Project*" -and $_.CommandLine -like "*bot/index.js*" }
}
Log "watcher started"
while ($true) {
  $existing = Get-BotProcess
  if ($existing) {
    Log "bot already running pid=$($existing.ProcessId -join ','); check again in 60s"
    Start-Sleep -Seconds 60
    continue
  }
  Log "starting bot"
  & npm.cmd run bot 2>&1 | Tee-Object -FilePath $LogFile -Append
  Log "bot exited code=$LASTEXITCODE; restart in 8s"
  Start-Sleep -Seconds 8
}
