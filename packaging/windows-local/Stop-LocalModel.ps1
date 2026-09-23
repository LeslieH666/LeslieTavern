$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$ExpectedExecutable = [IO.Path]::GetFullPath((Join-Path $ProjectRoot 'tools\koboldcpp\koboldcpp.exe'))
$PidPath = Join-Path $ProjectRoot 'Run\KoboldCpp.pid'
$ModelStatePath = Join-Path $ProjectRoot 'Run\KoboldCpp.model.json'
$HostAddress = '127.0.0.1'
$Port = 5001

function Test-LoopbackPort {
    $client = [Net.Sockets.TcpClient]::new()
    try {
        $connectTask = $client.ConnectAsync($HostAddress, $Port)
        if (-not $connectTask.Wait(500)) {
            return $false
        }
        return $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

if (-not (Test-Path -LiteralPath $PidPath)) {
    Remove-Item -LiteralPath $ModelStatePath -Force -ErrorAction SilentlyContinue
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
    Remove-Item -LiteralPath $ModelStatePath -Force -ErrorAction SilentlyContinue
    Write-Host 'KoboldCpp is already stopped.' -ForegroundColor Green
    exit 0
}

if (-not $process.Path -or [IO.Path]::GetFullPath($process.Path) -ne $ExpectedExecutable) {
    throw "PID $processId does not belong to this workspace's KoboldCpp. Stop refused."
}

# KoboldCpp can keep a model worker child alive. Stop only the tracked process
# tree so unrelated local model services and other applications are untouched.
$stopResult = Start-Process -FilePath 'taskkill.exe' -ArgumentList @('/PID', [string]$processId, '/T') -WindowStyle Hidden -Wait -PassThru
if ($stopResult.ExitCode -ne 0) {
    $stopResult = Start-Process -FilePath 'taskkill.exe' -ArgumentList @('/PID', [string]$processId, '/T', '/F') -WindowStyle Hidden -Wait -PassThru
}
if ($stopResult.ExitCode -ne 0) {
    throw "KoboldCpp process tree could not be stopped (taskkill exit code $($stopResult.ExitCode))."
}

for ($attempt = 0; $attempt -lt 10; $attempt++) {
    if (-not (Get-Process -Id $processId -ErrorAction SilentlyContinue) -and -not (Test-LoopbackPort)) {
        break
    }
    Start-Sleep -Milliseconds 200
}
if ((Get-Process -Id $processId -ErrorAction SilentlyContinue) -or (Test-LoopbackPort)) {
    throw 'KoboldCpp or its model worker is still running. The PID file was retained for another stop attempt.'
}

Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $ModelStatePath -Force -ErrorAction SilentlyContinue
Write-Host 'KoboldCpp local model stopped.' -ForegroundColor Green
