param([int]$Tail = 80)
$Project = "C:\Users\18786\Documents\Codex\2026-07-13\v\work\Work-AI\项目\航海小抓"
$StartupFile = Join-Path ([Environment]::GetFolderPath("Startup")) "FeishuKbBot.cmd"
$WatchScript = Join-Path $Project "scripts\watch-bot-startup.ps1"
$LogFile = Join-Path $Project "logs\bot-autostart.log"

if (Test-Path $StartupFile) { Write-Host "Startup file: $StartupFile" } else { Write-Host "Startup file: not found" }
if (Test-Path $WatchScript) { Write-Host "Watcher script: $WatchScript" } else { Write-Host "Watcher script: not found" }

$processes = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -like "*$Project*" -and ($_.CommandLine -like "*watch-bot-startup.ps1*" -or $_.CommandLine -like "*bot/index.js*" -or $_.CommandLine -like "*npm*run*bot*")
}

if ($processes) {
  Write-Host "Processes: running"
  $processes | Select-Object ProcessId,Name,CommandLine | Format-List
} else {
  Write-Host "Processes: not found"
}

if (Test-Path $LogFile) {
  Write-Host ""
  Write-Host "Last $Tail log lines:"
  Get-Content $LogFile -Tail $Tail
} else {
  Write-Host "Log: not found"
}
