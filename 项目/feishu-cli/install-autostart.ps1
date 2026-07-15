param(
    [string]$HermesRoot = "$HOME\hermes-agent",
    [switch]$StartNow
)

$ErrorActionPreference = "Stop"
$HermesRoot = [System.IO.Path]::GetFullPath($HermesRoot)
$PythonExe = Join-Path $HermesRoot "venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "没有找到 Hermes Python: $PythonExe"
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
    $GatewayProcess = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" | Where-Object {
        $_.CommandLine -match "hermes_cli\.main gateway run"
    }
    if (-not $GatewayProcess) {
        Start-Process -FilePath $TargetScript -WorkingDirectory $HermesRoot -WindowStyle Hidden
    }
}

Write-Host "登录自启动已安装: $Shortcut"
Write-Host "安全启动脚本: $TargetScript"
