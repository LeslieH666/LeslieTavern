[CmdletBinding()]
param(
    [ValidateSet('Menu', 'Leslie', 'All', 'Stop', 'Doctor')]
    [string]$Mode = 'Menu',
    [switch]$RebuildAiri
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$StartLeslieScript = Join-Path $PSScriptRoot 'Start-LeslieTavern.ps1'
$StopLeslieScript = Join-Path $PSScriptRoot 'Stop-LeslieTavern.ps1'
$LesliePidPath = Join-Path $ProjectRoot 'Run\LeslieTavern.pid'
$AiriStatePath = Join-Path $ProjectRoot 'Run\AIRI.state.json'
$AiriLogsPath = Join-Path $ProjectRoot 'logs\airi'
$ConfigPath = Join-Path $ProjectRoot 'Config\config.yaml'

function Write-Section([string]$Title) {
    Write-Host ''
    Write-Host "== $Title ==" -ForegroundColor Cyan
}

function Get-TrackedProcess([string]$PidPath) {
    if (-not (Test-Path -LiteralPath $PidPath)) {
        return $null
    }

    $savedPid = 0
    if (-not [int]::TryParse((Get-Content -LiteralPath $PidPath -Raw).Trim(), [ref]$savedPid)) {
        return $null
    }

    return Get-Process -Id $savedPid -ErrorAction SilentlyContinue
}

function Get-LesliePort {
    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        throw "LeslieTavern config is missing: $ConfigPath"
    }

    $configText = Get-Content -LiteralPath $ConfigPath -Raw -Encoding utf8
    $portMatch = [regex]::Match($configText, '(?m)^port:\s*(\d+)\s*$')
    if (-not $portMatch.Success) {
        throw "Unable to resolve the LeslieTavern port from $ConfigPath"
    }

    return [int]$portMatch.Groups[1].Value
}

function Test-LeslieLanListener {
    $configText = Get-Content -LiteralPath $ConfigPath -Raw -Encoding utf8
    return [regex]::IsMatch($configText, '(?m)^listen:\s*true\s*$')
}

function Resolve-AiriRoot {
    $resolved = [IO.Path]::GetFullPath((Join-Path $ProjectRoot 'airi'))
    $rootPackage = Join-Path $resolved 'package.json'
    $desktopPackage = Join-Path $resolved 'apps\stage-tamagotchi\package.json'
    if ((Test-Path -LiteralPath $rootPackage) -and (Test-Path -LiteralPath $desktopPackage)) {
        return $resolved
    }

    throw "Integrated AIRI source is missing from $resolved"
}

function Resolve-NodeExecutable([switch]$Optional) {
    $candidates = @()
    if ($env:LESLIE_NODE_EXE) {
        $candidates += $env:LESLIE_NODE_EXE
    }

    $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($systemNode) {
        $candidates += $systemNode.Source
    }

    if ($env:USERPROFILE) {
        $candidates += Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    }

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return [IO.Path]::GetFullPath($candidate)
        }
    }

    if ($Optional) {
        return $null
    }
    throw 'Node.js was not found. Install Node.js 20+ or set LESLIE_NODE_EXE.'
}

function Resolve-AiriElectron([string]$AiriRoot) {
    $appRoot = Join-Path $AiriRoot 'apps\stage-tamagotchi'
    $electronModule = Join-Path $appRoot 'node_modules\electron'
    $pathFile = Join-Path $electronModule 'path.txt'

    if (Test-Path -LiteralPath $pathFile) {
        $electronPath = (Get-Content -LiteralPath $pathFile -Raw).Trim()
        if (-not [IO.Path]::IsPathRooted($electronPath)) {
            $electronPath = Join-Path $electronModule $electronPath
        }
        if (Test-Path -LiteralPath $electronPath) {
            return [IO.Path]::GetFullPath($electronPath)
        }
    }

    $moduleElectron = Join-Path $electronModule 'dist\electron.exe'
    if (Test-Path -LiteralPath $moduleElectron) {
        return [IO.Path]::GetFullPath($moduleElectron)
    }

    $leslieElectron = Join-Path $ProjectRoot 'Runtime\electron.exe'
    if (Test-Path -LiteralPath $leslieElectron) {
        return [IO.Path]::GetFullPath($leslieElectron)
    }

    throw 'No Electron runtime is available for AIRI. Install AIRI dependencies or restore LeslieTavern Runtime.'
}

function Normalize-ProcessPath {
    $processPath = [Environment]::GetEnvironmentVariable('Path', 'Process')
    [Environment]::SetEnvironmentVariable('Path', $null, 'Process')
    [Environment]::SetEnvironmentVariable('PATH', $null, 'Process')
    [Environment]::SetEnvironmentVariable('Path', $processPath, 'Process')
}

function Ensure-AiriBuild([string]$AiriRoot, [bool]$ForceBuild) {
    $appRoot = Join-Path $AiriRoot 'apps\stage-tamagotchi'
    $outRoot = Join-Path $appRoot 'out'
    $buildStampPath = Join-Path $outRoot '.leslie-build-success'
    $artifactPaths = @(
        (Join-Path $outRoot 'main\index.js'),
        (Join-Path $outRoot 'preload\index.mjs'),
        (Join-Path $outRoot 'renderer\index.html')
    )
    $missingArtifact = $artifactPaths |
        Where-Object { -not (Test-Path -LiteralPath $_) } |
        Select-Object -First 1
    if (-not $missingArtifact -and (Test-Path -LiteralPath $buildStampPath) -and -not $ForceBuild) {
        $buildTime = (Get-Item -LiteralPath $buildStampPath).LastWriteTimeUtc
        $packageSourceRoots = Get-ChildItem -LiteralPath (Join-Path $AiriRoot 'packages') -Directory |
            ForEach-Object { Join-Path $_.FullName 'src' } |
            Where-Object { Test-Path -LiteralPath $_ }
        $sourceRoots = @(
            (Join-Path $appRoot 'src')
        ) + $packageSourceRoots
        $newerSource = $sourceRoots |
            Where-Object { Test-Path -LiteralPath $_ } |
            ForEach-Object { Get-ChildItem -LiteralPath $_ -Recurse -File } |
            Where-Object { $_.LastWriteTimeUtc -gt $buildTime } |
            Select-Object -First 1
        if (-not $newerSource) {
            $configurationPaths = @(
                (Join-Path $AiriRoot 'package.json'),
                (Join-Path $AiriRoot 'pnpm-lock.yaml'),
                (Join-Path $AiriRoot 'pnpm-workspace.yaml'),
                (Join-Path $appRoot 'package.json'),
                (Join-Path $appRoot 'electron.vite.config.ts')
            )
            $newerSource = $configurationPaths |
                Where-Object { Test-Path -LiteralPath $_ } |
                ForEach-Object { Get-Item -LiteralPath $_ } |
                Where-Object { $_.LastWriteTimeUtc -gt $buildTime } |
                Select-Object -First 1
        }
        if (-not $newerSource) {
            return
        }
        Write-Host "AIRI source changed after the last successful build: $($newerSource.FullName)" -ForegroundColor Yellow
    }

    $nodePath = Resolve-NodeExecutable
    $electronVite = Join-Path $appRoot 'node_modules\electron-vite\bin\electron-vite.js'
    if (-not (Test-Path -LiteralPath $electronVite)) {
        throw 'AIRI dependencies are missing. Install them before building AIRI.'
    }

    Write-Host 'Building AIRI Desktop. This can take a few minutes...' -ForegroundColor Yellow
    $oldPath = $env:Path
    try {
        $env:Path = "$(Split-Path -Parent $nodePath);$oldPath"
        Push-Location $appRoot
        try {
            & $nodePath $electronVite build
            if ($LASTEXITCODE -ne 0) {
                throw "AIRI build failed with exit code $LASTEXITCODE."
            }
        } finally {
            Pop-Location
        }
    } finally {
        $env:Path = $oldPath
    }

    foreach ($artifactPath in $artifactPaths) {
        if (-not (Test-Path -LiteralPath $artifactPath)) {
            throw "AIRI build did not create $artifactPath"
        }
    }

    [IO.File]::WriteAllText($buildStampPath, (Get-Date).ToUniversalTime().ToString('o'), [Text.UTF8Encoding]::new($false))
}

function New-BridgeToken {
    $bytes = New-Object byte[] 32
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $random.GetBytes($bytes)
    } finally {
        $random.Dispose()
    }
    return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}

function Wait-LeslieBridge([string]$BaseUrl, [string]$Token) {
    $headers = @{ Authorization = "Bearer $Token" }
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try {
            $health = Invoke-RestMethod -Uri "${BaseUrl}health" -Headers $headers -TimeoutSec 3
            if ($health.status -eq 'ok' -and $health.protocol.version -eq '1') {
                return
            }
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
    throw "Leslie Bridge did not become ready at $BaseUrl"
}

function Read-AiriState {
    if (-not (Test-Path -LiteralPath $AiriStatePath)) {
        return $null
    }
    try {
        return Get-Content -LiteralPath $AiriStatePath -Raw -Encoding utf8 | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Get-AiriTrackedProcess {
    $state = Read-AiriState
    if (-not $state -or -not $state.pid) {
        return $null
    }
    return Get-Process -Id ([int]$state.pid) -ErrorAction SilentlyContinue
}

function Start-Airi([string]$AiriRoot, [string]$BridgeBaseUrl) {
    $existing = Get-AiriTrackedProcess
    if ($existing) {
        throw "AIRI is already running (PID $($existing.Id))."
    }
    Remove-Item -LiteralPath $AiriStatePath -Force -ErrorAction SilentlyContinue

    $appRoot = Join-Path $AiriRoot 'apps\stage-tamagotchi'
    $electronPath = Resolve-AiriElectron $AiriRoot
    New-Item -ItemType Directory -Path $AiriLogsPath -Force | Out-Null
    New-Item -ItemType Directory -Path (Split-Path -Parent $AiriStatePath) -Force | Out-Null
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $stdoutLog = Join-Path $AiriLogsPath "AIRI-$timestamp.stdout.log"
    $stderrLog = Join-Path $AiriLogsPath "AIRI-$timestamp.stderr.log"

    $env:LESLIE_BRIDGE_BASE_URL = $BridgeBaseUrl
    $env:LESLIE_COMPANION_MODE = '1'
    Normalize-ProcessPath
    $arguments = @(('"{0}"' -f $appRoot))
    $process = Start-Process -FilePath $electronPath -ArgumentList $arguments -WorkingDirectory $AiriRoot -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru

    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 250
        $process.Refresh()
        if ($process.HasExited) {
            throw "AIRI exited during startup. Check $stderrLog"
        }
    }

    $state = [ordered]@{
        pid = $process.Id
        executablePath = [IO.Path]::GetFullPath($electronPath)
        startedAt = (Get-Date).ToString('o')
    }
    [IO.File]::WriteAllText($AiriStatePath, ($state | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    Write-Host "AIRI started (PID $($process.Id))." -ForegroundColor Green
}

function Stop-Airi {
    $state = Read-AiriState
    if (-not $state -or -not $state.pid) {
        Write-Host 'AIRI is not tracked as running.' -ForegroundColor Yellow
        return
    }

    $process = Get-Process -Id ([int]$state.pid) -ErrorAction SilentlyContinue
    if (-not $process) {
        Remove-Item -LiteralPath $AiriStatePath -Force -ErrorAction SilentlyContinue
        Write-Host 'AIRI is already stopped.' -ForegroundColor Green
        return
    }

    if ($process.Path -and $state.executablePath -and [IO.Path]::GetFullPath($process.Path) -ne [IO.Path]::GetFullPath([string]$state.executablePath)) {
        throw "AIRI PID $($state.pid) belongs to a different executable. Stop refused."
    }

    # Electron uses renderer/GPU child processes. Stopping only the parent can
    # leave an orphan holding AIRI's single-instance lock, so stop the tree.
    $stopResult = Start-Process -FilePath 'taskkill.exe' -ArgumentList @('/PID', [string]$state.pid, '/T') -WindowStyle Hidden -Wait -PassThru
    if ($stopResult.ExitCode -ne 0 -and (Get-Process -Id ([int]$state.pid) -ErrorAction SilentlyContinue)) {
        Start-Process -FilePath 'taskkill.exe' -ArgumentList @('/PID', [string]$state.pid, '/T', '/F') -WindowStyle Hidden -Wait | Out-Null
    }
    Remove-Item -LiteralPath $AiriStatePath -Force -ErrorAction SilentlyContinue
    Write-Host 'AIRI stopped.' -ForegroundColor Green
}

function Start-LeslieOnly {
    Write-Section 'Starting LeslieTavern'
    & $StartLeslieScript
}

function Start-All([bool]$ForceBuild) {
    Write-Section 'Starting LeslieTavern + AIRI'
    if (Get-TrackedProcess $LesliePidPath) {
        throw 'LeslieTavern is already running without this launch session. Stop it, then start both applications together.'
    }
    if (Get-AiriTrackedProcess) {
        throw 'AIRI is already running. Stop both applications before starting a new combined session.'
    }

    $airiRoot = Resolve-AiriRoot
    $port = Get-LesliePort
    $baseUrl = "http://127.0.0.1:$port/api/leslie/bridge/v1/"
    $bridgeToken = New-BridgeToken
    $previousToken = $env:LESLIE_BRIDGE_TOKEN
    $previousBaseUrl = $env:LESLIE_BRIDGE_BASE_URL
    $previousCompanionMode = $env:LESLIE_COMPANION_MODE
    $leslieStarted = $false

    try {
        $env:LESLIE_BRIDGE_TOKEN = $bridgeToken
        $env:LESLIE_BRIDGE_BASE_URL = $baseUrl
        & $StartLeslieScript
        $leslieStarted = $true
        Wait-LeslieBridge $baseUrl $bridgeToken
        Write-Host "Leslie Bridge is ready at $baseUrl" -ForegroundColor Green

        Ensure-AiriBuild $airiRoot $ForceBuild
        Start-Airi $airiRoot $baseUrl
        Write-Host 'Both applications are ready. The bridge token exists only in their process environments.' -ForegroundColor Green
        if (Test-LeslieLanListener) {
            Write-Host 'LeslieTavern LAN listening is enabled in Config\config.yaml. Keep its whitelist and firewall scope restricted.' -ForegroundColor Yellow
        }
    } catch {
        Stop-Airi
        if ($leslieStarted) {
            & $StopLeslieScript
        }
        throw
    } finally {
        $env:LESLIE_BRIDGE_TOKEN = $previousToken
        $env:LESLIE_BRIDGE_BASE_URL = $previousBaseUrl
        $env:LESLIE_COMPANION_MODE = $previousCompanionMode
    }
}

function Stop-All {
    Write-Section 'Stopping AIRI + LeslieTavern'
    Stop-Airi
    & $StopLeslieScript
}

function Show-Doctor {
    Write-Section 'Launcher diagnostics'
    $airiRoot = Resolve-AiriRoot
    $airiApp = Join-Path $airiRoot 'apps\stage-tamagotchi'
    $airiEntry = Join-Path $airiApp 'out\main\index.js'
    $electronPath = Resolve-AiriElectron $airiRoot
    $nodePath = Resolve-NodeExecutable -Optional
    $port = Get-LesliePort

    Write-Host "Leslie root : $ProjectRoot"
    Write-Host "Leslie port : $port"
    Write-Host "LAN listener: $(if (Test-LeslieLanListener) { 'enabled' } else { 'disabled' })"
    Write-Host "AIRI root    : $airiRoot"
    Write-Host "AIRI build   : $(if (Test-Path -LiteralPath $airiEntry) { 'ready' } else { 'missing; the combined launcher will build it' })"
    Write-Host "Electron     : $electronPath"
    Write-Host "Node.js      : $(if ($nodePath) { $nodePath } else { 'not found; required only when AIRI needs a build' })"
    Write-Host "Leslie state : $(if (Get-TrackedProcess $LesliePidPath) { 'running' } else { 'stopped' })"
    Write-Host "AIRI state   : $(if (Get-AiriTrackedProcess) { 'running' } else { 'stopped' })"
    Write-Host 'Diagnostics completed.' -ForegroundColor Green
}

function Show-Menu {
    Write-Host 'LeslieTavern + AIRI Launcher' -ForegroundColor Cyan
    Write-Host '1. Start LeslieTavern only'
    Write-Host '2. Start LeslieTavern + AIRI'
    Write-Host '3. Stop AIRI + LeslieTavern'
    Write-Host '4. Run launcher diagnostics'
    Write-Host '5. Rebuild AIRI, then start both'
    Write-Host '0. Exit'
    $selection = Read-Host 'Select an option'

    switch ($selection) {
        '1' { Start-LeslieOnly }
        '2' { Start-All $false }
        '3' { Stop-All }
        '4' { Show-Doctor }
        '5' { Start-All $true }
        '0' { return }
        default { throw "Unknown menu option: $selection" }
    }
}

switch ($Mode) {
    'Menu' { Show-Menu }
    'Leslie' { Start-LeslieOnly }
    'All' { Start-All ([bool]$RebuildAiri) }
    'Stop' { Stop-All }
    'Doctor' { Show-Doctor }
}
