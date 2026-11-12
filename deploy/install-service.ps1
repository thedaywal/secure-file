<#
.SYNOPSIS
    Install SecureFile as two Windows services (Waitress API + Caddy proxy).

.DESCRIPTION
    Registers the Django app under Waitress and the Caddy reverse proxy with
    NSSM so both start automatically and survive reboots and logouts. Run this
    once, from an elevated PowerShell prompt, after the repository has been
    cloned and deploy.ps1 has produced backend\.venv and frontend\dist.

    Requires nssm.exe on PATH (or pass -Nssm) and caddy.exe on PATH (or -Caddy).

.PARAMETER Root
    Repository root on the server. Defaults to C:\securefile.

.PARAMETER Domain
    Public hostname Caddy should obtain a certificate for.
#>
[CmdletBinding()]
param(
    [string]$Root = 'C:\securefile',
    [string]$Domain = 'serviceindex.duckdns.org',
    [string]$Nssm = 'nssm',
    [string]$Caddy = 'caddy'
)

$ErrorActionPreference = 'Stop'

$Backend = Join-Path $Root 'backend'
$Deploy = Join-Path $Root 'deploy'
$Python = Join-Path $Backend '.venv\Scripts\python.exe'
$Logs = Join-Path $Root 'logs'

$ApiService = 'SecureFileAPI'
$ProxyService = 'SecureFileProxy'

if (-not (Test-Path $Python)) { throw "Python venv missing at $Python — run deploy.ps1 first." }
New-Item -ItemType Directory -Force -Path $Logs | Out-Null

function Install-NssmService {
    param(
        [string]$Name,
        [string]$Exe,
        # NB: do not name this $Args — that is a reserved PowerShell automatic
        # variable and the value would silently bind to nothing.
        [string]$Arguments,
        [string]$WorkDir,
        [hashtable]$Environment
    )

    # On a fresh install the service does not exist yet, so nssm writes
    # "Can't open service!" to stderr; under $ErrorActionPreference='Stop'
    # PowerShell 5.1 would turn that into a terminating error and abort the
    # install. Relax the preference for these idempotent cleanup calls.
    $ErrorActionPreference = 'SilentlyContinue'
    & $Nssm stop $Name 2>$null | Out-Null
    & $Nssm remove $Name confirm 2>$null | Out-Null
    $ErrorActionPreference = 'Stop'

    & $Nssm install $Name $Exe
    & $Nssm set $Name AppParameters $Arguments
    & $Nssm set $Name AppDirectory $WorkDir
    & $Nssm set $Name Start SERVICE_AUTO_START
    & $Nssm set $Name AppStdout (Join-Path $Logs "$Name.out.log")
    & $Nssm set $Name AppStderr (Join-Path $Logs "$Name.err.log")
    & $Nssm set $Name AppRotateFiles 1
    & $Nssm set $Name AppRotateBytes 10485760

    if ($Environment.Count -gt 0) {
        $pairs = @()
        foreach ($key in $Environment.Keys) { $pairs += "$key=$($Environment[$key])" }
        & $Nssm set $Name AppEnvironmentExtra @pairs
    }

    Write-Host "Installed service $Name" -ForegroundColor Green
}

Install-NssmService `
    -Name $ApiService `
    -Exe $Python `
    -Arguments (Join-Path $Deploy 'waitress_server.py') `
    -WorkDir $Root `
    -Environment @{
        SECUREFILE_WAITRESS_HOST = '127.0.0.1'
        SECUREFILE_WAITRESS_PORT = '8000'
    }

# Caddy wants forward slashes in the environment path, not Windows backslashes.
$RootForCaddy = $Root.Replace('\', '/')

Install-NssmService `
    -Name $ProxyService `
    -Exe $Caddy `
    -Arguments ('run --config "{0}"' -f (Join-Path $Deploy 'Caddyfile')) `
    -WorkDir $Root `
    -Environment @{
        SECUREFILE_ROOT   = $RootForCaddy
        SECUREFILE_DOMAIN = $Domain
    }

Start-Service $ApiService
Start-Service $ProxyService

Write-Host "`nDone. API on 127.0.0.1:8000, Caddy serving https://$Domain" -ForegroundColor Green
