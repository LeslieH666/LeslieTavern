$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$DataPath = Join-Path $ProjectRoot 'data'
$BackupsPath = Join-Path $ProjectRoot 'backups\UserData'
$PidPath = Join-Path $ProjectRoot 'Run\LeslieTavern.pid'

if (Test-Path -LiteralPath $PidPath) {
    $runningPid = 0
    [void][int]::TryParse((Get-Content -LiteralPath $PidPath -Raw).Trim(), [ref]$runningPid)
    if ($runningPid -gt 0 -and (Get-Process -Id $runningPid -ErrorAction SilentlyContinue)) {
        throw 'Stop LeslieTavern before creating a consistent backup.'
    }
}

if (-not (Test-Path -LiteralPath $DataPath)) {
    throw "The canonical data directory is missing: $DataPath"
}
New-Item -ItemType Directory -Path $BackupsPath -Force | Out-Null
$backupPath = Join-Path $BackupsPath ("LeslieTavern-UserData-{0}.zip" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
[IO.Compression.ZipFile]::CreateFromDirectory($DataPath, $backupPath, [IO.Compression.CompressionLevel]::Optimal, $false)
$hash = Get-FileHash -LiteralPath $backupPath -Algorithm SHA256
Write-Host "User data backup created: $backupPath" -ForegroundColor Green
Write-Host "SHA-256: $($hash.Hash)" -ForegroundColor Green
