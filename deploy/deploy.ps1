<#
.SYNOPSIS
    Build and deploy SecureFile on a Windows server (Waitress + Caddy).

.DESCRIPTION
    Pulls the latest source, refreshes both toolchains, applies migrations,
    collects Django static files, rebuilds the React SPA and bounces the Windows
    services so the running site matches the source tree. Re-run it for every
    deploy.

.PARAMETER Root
    Repository root on the server. Defaults to C:\securefile.

.PARAMETER SkipPull
    Skip `git pull` (use when deploying a working copy that was copied in place).
#>
[CmdletBinding()]
param(
    [string]$Root = 'C:\securefile',
    [switch]$SkipPull
)

$ErrorActionPreference = 'Stop'

$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'
$Python = Join-Path $Backend '.venv\Scripts\python.exe'
$Services = @('SecureFileAPI', 'SecureFileProxy')

function Step($Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }

Step 'Fetching latest source'
if (-not $SkipPull) {
    git -C $Root pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw 'git pull failed — resolve local changes first.' }
}

Step 'Ensuring backend virtual environment'
if (-not (Test-Path $Python)) {
    python -m venv (Join-Path $Backend '.venv')
}

Step 'Installing backend dependencies'
& $Python -m pip install --upgrade pip
& $Python -m pip install -r (Join-Path $Backend 'requirements.txt')

Step 'Applying database migrations'
& $Python (Join-Path $Backend 'manage.py') migrate --noinput

Step 'Collecting static files'
& $Python (Join-Path $Backend 'manage.py') collectstatic --noinput

Step 'Building the frontend'
Push-Location $Frontend
try {
    npm ci
    npm run build
} finally {
    Pop-Location
}

Step 'Restarting services'
foreach ($Service in $Services) {
    if (Get-Service -Name $Service -ErrorAction SilentlyContinue) {
        Restart-Service -Name $Service
        Write-Host "Restarted $Service" -ForegroundColor Green
    } else {
        Write-Host "Service $Service not installed — run deploy\install-service.ps1." -ForegroundColor Yellow
    }
}

Write-Host "`nDeploy complete." -ForegroundColor Green
