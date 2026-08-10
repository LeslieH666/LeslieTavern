$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$PackageRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$DataPath = Join-Path $PackageRoot 'UserData'
$BackupsPath = Join-Path $PackageRoot 'Backups'
$PidPath = Join-Path $PackageRoot 'Run\LeslieTavern.pid'

if (Test-Path -LiteralPath $PidPath) {
    $runningPid = 0
    [void][int]::TryParse((Get-Content -LiteralPath $PidPath -Raw).Trim(), [ref]$runningPid)
    if ($runningPid -gt 0 -and (Get-Process -Id $runningPid -ErrorAction SilentlyContinue)) {
        throw 'Stop LeslieTavern before creating a consistent backup.'
    }
}

New-Item -ItemType Directory -Path $DataPath -Force | Out-Null
New-Item -ItemType Directory -Path $BackupsPath -Force | Out-Null
$backupPath = Join-Path $BackupsPath ("LeslieTavern-UserData-{0}.zip" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
[IO.Compression.ZipFile]::CreateFromDirectory($DataPath, $backupPath, [IO.Compression.CompressionLevel]::Optimal, $false)
Write-Host "User data backup created: $backupPath" -ForegroundColor Green
