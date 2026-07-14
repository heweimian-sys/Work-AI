param(
    [string]$HermesRoot = "$HOME\hermes-agent",
    [switch]$StartNow
)

$ErrorActionPreference = "Stop"
$HermesRoot = [System.IO.Path]::GetFullPath($HermesRoot)
$HermesExe = Join-Path $HermesRoot "venv\Scripts\hermes.exe"
if (-not (Test-Path -LiteralPath $HermesExe)) {
    throw "没有找到 Hermes: $HermesExe"
}

$SourceScript = Join-Path $PSScriptRoot "start-gateway-safe.bat"
$TargetScript = Join-Path $HermesRoot "start-gateway-safe.bat"
Copy-Item -LiteralPath $SourceScript -Destination $TargetScript -Force

$Startup = [Environment]::GetFolderPath("Startup")
$Shortcut = Join-Path $Startup "Hermes Feishu Gateway.lnk"
$Shell = New-Object -ComObject WScript.Shell
$Link = $Shell.CreateShortcut($Shortcut)
$Link.TargetPath = "C:\Windows\System32\cmd.exe"
$Link.Arguments = "/c `"$TargetScript`""
$Link.WorkingDirectory = $HermesRoot
$Link.WindowStyle = 7
$Link.Description = "Start Hermes Feishu Gateway safely at Windows sign-in"
$Link.Save()

if ($StartNow) {
    $Status = & $HermesExe gateway status 2>&1 | Out-String
    if ($Status -notmatch "Gateway is running") {
        Start-Process -FilePath $TargetScript -WorkingDirectory $HermesRoot -WindowStyle Hidden
    }
}

Write-Host "登录自启动已安装: $Shortcut"
Write-Host "安全启动脚本: $TargetScript"
