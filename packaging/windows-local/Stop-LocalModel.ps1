$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$ExpectedExecutable = [IO.Path]::GetFullPath((Join-Path $ProjectRoot 'tools\koboldcpp\koboldcpp.exe'))
$PidPath = Join-Path $ProjectRoot 'Run\KoboldCpp.pid'

if (-not (Test-Path -LiteralPath $PidPath)) {
    Write-Host 'KoboldCpp is not tracked as running.' -ForegroundColor Yellow
    exit 0
}

$processId = 0
if (-not [int]::TryParse((Get-Content -LiteralPath $PidPath -Raw).Trim(), [ref]$processId)) {
    throw 'The local model PID file is invalid. Refusing to stop an unknown process.'
}

$process = Get-Process -Id $processId -ErrorAction SilentlyContinue
if (-not $process) {
    Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
    Write-Host 'KoboldCpp is already stopped.' -ForegroundColor Green
    exit 0
}

if ($process.Path -and [IO.Path]::GetFullPath($process.Path) -ne $ExpectedExecutable) {
    throw "PID $processId does not belong to this workspace's KoboldCpp. Stop refused."
}

# KoboldCpp can keep a model worker child alive. Stop only the tracked process
# tree so unrelated local model services and other applications are untouched.
$stopResult = Start-Process -FilePath 'taskkill.exe' -ArgumentList @('/PID', [string]$processId, '/T') -WindowStyle Hidden -Wait -PassThru
if ($stopResult.ExitCode -ne 0 -and (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath 'taskkill.exe' -ArgumentList @('/PID', [string]$processId, '/T', '/F') -WindowStyle Hidden -Wait | Out-Null
}

Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
Write-Host 'KoboldCpp local model stopped.' -ForegroundColor Green
