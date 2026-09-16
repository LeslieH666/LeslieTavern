$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$ModelExecutable = Join-Path $ProjectRoot 'tools\koboldcpp\koboldcpp.exe'
$ModelPath = Join-Path $ProjectRoot 'models\Peach-2.0-9B-8k-Roleplay\Peach-2.0-9B-8k-Roleplay.Q4_K_M.gguf'
$RunPath = Join-Path $ProjectRoot 'Run'
$LogsPath = Join-Path $ProjectRoot 'logs\koboldcpp'
$PidPath = Join-Path $RunPath 'KoboldCpp.pid'
$HostAddress = '127.0.0.1'
$Port = 5001
$Endpoint = "http://${HostAddress}:${Port}"

foreach ($required in @($ModelExecutable, $ModelPath)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Local model file is missing: $required"
    }
}

function Get-TrackedModelProcess {
    if (-not (Test-Path -LiteralPath $PidPath)) {
        return $null
    }

    $savedPid = 0
    if (-not [int]::TryParse((Get-Content -LiteralPath $PidPath -Raw).Trim(), [ref]$savedPid)) {
        throw 'The local model PID file is invalid. Refusing to start an unknown process.'
    }

    $process = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
    if (-not $process) {
        Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
        return $null
    }

    if ($process.Path -and [IO.Path]::GetFullPath($process.Path) -ne [IO.Path]::GetFullPath($ModelExecutable)) {
        throw "PID $savedPid does not belong to this workspace's KoboldCpp. Start refused."
    }

    return $process
}

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

New-Item -ItemType Directory -Path $RunPath, $LogsPath -Force | Out-Null
$tracked = Get-TrackedModelProcess
if ($tracked) {
    Write-Host "KoboldCpp is already running (PID $($tracked.Id))." -ForegroundColor Yellow
    exit 0
}

if (Test-LoopbackPort) {
    throw "Port $Port is already in use. Refusing to stop or replace an untracked process."
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdoutLog = Join-Path $LogsPath "KoboldCpp-$timestamp.stdout.log"
$stderrLog = Join-Path $LogsPath "KoboldCpp-$timestamp.stderr.log"
$arguments = @(
    '--model', ('"{0}"' -f $ModelPath),
    '--host', $HostAddress,
    '--port', [string]$Port,
    '--contextsize', '8192',
    '--gpulayers', '999',
    '--skiplauncher'
)

$process = Start-Process -FilePath $ModelExecutable -ArgumentList $arguments -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
[IO.File]::WriteAllText($PidPath, [string]$process.Id, [Text.UTF8Encoding]::new($false))

$ready = $false
for ($attempt = 0; $attempt -lt 90; $attempt++) {
    Start-Sleep -Milliseconds 500
    $process.Refresh()
    if ($process.HasExited) {
        Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
        throw "KoboldCpp failed to start. Check $stderrLog"
    }

    if (-not (Test-LoopbackPort)) {
        continue
    }

    try {
        $response = Invoke-WebRequest -Uri "$Endpoint/v1/models" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
            $ready = $true
            break
        }
    } catch {
        # The model can be listening while its API is still warming up.
    }
}

if ($ready) {
    Write-Host "Peach local model is ready at $Endpoint (PID $($process.Id))." -ForegroundColor Green
} else {
    Write-Host "KoboldCpp is still initializing (PID $($process.Id)). Logs: $LogsPath" -ForegroundColor Yellow
}
