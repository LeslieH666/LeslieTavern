$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$ElectronPath = Join-Path $ProjectRoot 'Runtime\electron.exe'
$AppEntry = Join-Path $ProjectRoot 'src\electron'
$ConfigPath = Join-Path $ProjectRoot 'Config\config.yaml'
$DataPath = Join-Path $ProjectRoot 'data'
$CachePath = Join-Path $ProjectRoot 'Cache'
$LogsPath = Join-Path $ProjectRoot 'logs\desktop'
$RunPath = Join-Path $ProjectRoot 'Run'
$PidPath = Join-Path $RunPath 'LeslieTavern.pid'

foreach ($required in @($ElectronPath, $AppEntry, $ConfigPath, $DataPath)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Unified workspace file is missing: $required"
    }
}

$configText = Get-Content -LiteralPath $ConfigPath -Raw -Encoding utf8
$portMatch = [regex]::Match($configText, '(?m)^port:\s*(\d+)\s*$')
if (-not $portMatch.Success) {
    throw "Unable to resolve the server port from $ConfigPath"
}
$expectedPort = [int]$portMatch.Groups[1].Value
$listenEnabled = [regex]::IsMatch($configText, '(?m)^listen:\s*true\s*$')
$listenAddressMatch = [regex]::Match($configText, '(?ms)^listenAddress:\s*\r?\n\s+ipv4:\s*["'']?([^"''#\r\n]+)')
$configuredIpv4 = if ($listenAddressMatch.Success) { $listenAddressMatch.Groups[1].Value.Trim() } else { '0.0.0.0' }
$expectedIpv4 = if ($listenEnabled) { $configuredIpv4 } else { '127.0.0.1' }
$expectedListener = '{0}:{1}' -f $expectedIpv4, $expectedPort

foreach ($directory in @($CachePath, $LogsPath, $RunPath)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

if (Test-Path -LiteralPath $PidPath) {
    $oldPid = 0
    [void][int]::TryParse((Get-Content -LiteralPath $PidPath -Raw).Trim(), [ref]$oldPid)
    if ($oldPid -gt 0 -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
        Write-Host "LeslieTavern is already running (PID $oldPid)." -ForegroundColor Yellow
        exit 0
    }
    Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdoutLog = Join-Path $LogsPath "LeslieTavern-$timestamp.stdout.log"
$stderrLog = Join-Path $LogsPath "LeslieTavern-$timestamp.stderr.log"
$arguments = @(
    ('"{0}"' -f $AppEntry),
    ('--configPath="{0}"' -f $ConfigPath),
    ('--dataRoot="{0}"' -f $DataPath),
    ('--electronDataRoot="{0}"' -f $CachePath),
    '--width=1280',
    '--height=800'
)

# Some automation environments expose both Path and PATH. Windows PowerShell
# treats environment names case-insensitively when Start-Process copies them,
# so normalize the process-local value before launching Electron.
$processPath = [Environment]::GetEnvironmentVariable('Path', 'Process')
[Environment]::SetEnvironmentVariable('Path', $null, 'Process')
[Environment]::SetEnvironmentVariable('PATH', $null, 'Process')
[Environment]::SetEnvironmentVariable('Path', $processPath, 'Process')

$process = Start-Process -FilePath $ElectronPath -ArgumentList $arguments -WorkingDirectory $ProjectRoot -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
[IO.File]::WriteAllText($PidPath, [string]$process.Id, [Text.UTF8Encoding]::new($false))

$started = $false
$actualListener = $null
for ($attempt = 0; $attempt -lt 90; $attempt++) {
    Start-Sleep -Milliseconds 500
    $process.Refresh()
    if ($process.HasExited) {
        Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
        $errorText = if (Test-Path -LiteralPath $stderrLog) { Get-Content -LiteralPath $stderrLog -Raw -ErrorAction SilentlyContinue } else { '' }
        throw "LeslieTavern failed to start. Check $stderrLog`r`n$errorText"
    }
    if (Test-Path -LiteralPath $stdoutLog) {
        $logText = Get-Content -LiteralPath $stdoutLog -Raw -ErrorAction SilentlyContinue
        if ($logText -match 'Using data root:\s*(.+)') {
            $actualDataRoot = [IO.Path]::GetFullPath($Matches[1].Trim())
            if ($actualDataRoot -ne [IO.Path]::GetFullPath($DataPath)) {
                Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
                Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
                throw "Data-root safety check failed. Actual: $actualDataRoot Expected: $DataPath"
            }
        }
        if ($logText -match 'SillyTavern is listening on IPv4:\s*([^\s:]+):(\d+)') {
            $actualListener = '{0}:{1}' -f $Matches[1], $Matches[2]
            if ($actualListener -ne $expectedListener) {
                Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
                Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
                throw "Listener safety check failed. Actual: $actualListener Expected: $expectedListener"
            }
            $started = $true
            break
        }
    }
}

if ($started) {
    Write-Host "LeslieTavern started on $actualListener. Close its window or run the stop shortcut to exit safely." -ForegroundColor Green
    if ($expectedIpv4 -eq '0.0.0.0') {
        $lanUrls = foreach ($networkInterface in [Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
            if ($networkInterface.OperationalStatus -ne [Net.NetworkInformation.OperationalStatus]::Up) {
                continue
            }
            $ipProperties = $networkInterface.GetIPProperties()
            $hasIpv4Gateway = $ipProperties.GatewayAddresses | Where-Object {
                $_.Address.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork
            }
            if (-not $hasIpv4Gateway) {
                continue
            }
            foreach ($unicastAddress in $ipProperties.UnicastAddresses) {
                $address = $unicastAddress.Address
                if ($address.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) {
                    continue
                }
                $addressBytes = $address.GetAddressBytes()
                $isPrivateAddress = $addressBytes[0] -eq 10 -or
                    ($addressBytes[0] -eq 172 -and $addressBytes[1] -ge 16 -and $addressBytes[1] -le 31) -or
                    ($addressBytes[0] -eq 192 -and $addressBytes[1] -eq 168)
                if ($isPrivateAddress) {
                    'http://{0}:{1}/' -f $address.IPAddressToString, $expectedPort
                }
            }
        }
        $lanUrls = $lanUrls | Sort-Object -Unique
        if ($lanUrls) {
            Write-Host ('LAN URL: ' + ($lanUrls -join '  ')) -ForegroundColor Cyan
        }
        Write-Host 'Devices on the directly connected private subnet are allowed automatically; Windows Firewall still enforces the inbound boundary.' -ForegroundColor Yellow
    }
} else {
    Write-Host "LeslieTavern is still initializing. Logs: $LogsPath" -ForegroundColor Yellow
}
