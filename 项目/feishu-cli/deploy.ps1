param(
    [string]$Target = "C:\Users\18786\hermes-agent\scripts",
    [switch]$Apply
)

$ErrorActionPreference = "Stop"
$Source = $PSScriptRoot
$Files = @(
    "ai_news.py",
    "news_store.py",
    "config.py",
    "date_utils.py",
    "feishu_cli.py",
    "daily_report.py",
    "weekly_data.py",
    "skill_trainer.py",
    "requirements.txt"
)

if (-not (Test-Path -LiteralPath $Target)) {
    throw "Hermes scripts 目录不存在: $Target"
}

$Changes = foreach ($File in $Files) {
    $SourceFile = Join-Path $Source $File
    $TargetFile = Join-Path $Target $File
    if (-not (Test-Path -LiteralPath $SourceFile)) {
        throw "发布源文件不存在: $SourceFile"
    }
    $SourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $SourceFile).Hash
    $TargetHash = if (Test-Path -LiteralPath $TargetFile) {
        (Get-FileHash -Algorithm SHA256 -LiteralPath $TargetFile).Hash
    } else {
        "MISSING"
    }
    [PSCustomObject]@{
        File = $File
        Changed = $SourceHash -ne $TargetHash
        TargetExists = $TargetHash -ne "MISSING"
    }
}

$Changes | Format-Table -AutoSize
if (-not $Apply) {
    Write-Host "预览完成。确认后使用: .\deploy.ps1 -Apply"
    exit 0
}

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Backup = Join-Path $Target "backup\feishu-cli-$Stamp"
New-Item -ItemType Directory -Path $Backup -Force | Out-Null

foreach ($Change in $Changes | Where-Object Changed) {
    $SourceFile = Join-Path $Source $Change.File
    $TargetFile = Join-Path $Target $Change.File
    if ($Change.TargetExists) {
        Copy-Item -LiteralPath $TargetFile -Destination (Join-Path $Backup $Change.File)
    }
    Copy-Item -LiteralPath $SourceFile -Destination $TargetFile
}

$SourceConfig = Join-Path $Source "config.yaml"
$TargetConfig = Join-Path $Target "config.yaml"
if ((Test-Path -LiteralPath $SourceConfig) -and -not (Test-Path -LiteralPath $TargetConfig)) {
    Copy-Item -LiteralPath $SourceConfig -Destination $TargetConfig
}

Write-Host "部署完成。备份目录: $Backup"
Write-Host "请运行 feishu_cli.py doctor 和 ai_news.py dry，再重启 Hermes Gateway。"
