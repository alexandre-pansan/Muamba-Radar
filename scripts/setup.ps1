<#
.SYNOPSIS
    First-time project setup: creates .venv, installs deps, and copies .env.example.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
#>
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonExe   = Join-Path $projectRoot '.venv\Scripts\python.exe'
$reqFile     = Join-Path $projectRoot 'backend\requirements.txt'
$envExample  = Join-Path $projectRoot '.env.example'
$envFile     = Join-Path $projectRoot '.env'

# --- 1. Create virtual environment ------------------------------------------
if (Test-Path $pythonExe) {
    Write-Host '[setup] .venv already exists - skipping creation.'
} else {
    Write-Host '[setup] Creating virtual environment...'
    python -m venv (Join-Path $projectRoot '.venv')
    Write-Host '[setup] .venv created.'
}

# --- 2. Install / upgrade dependencies --------------------------------------
Write-Host '[setup] Installing backend dependencies...'
& $pythonExe -m pip install --quiet --upgrade pip
& $pythonExe -m pip install --quiet -r $reqFile
Write-Host '[setup] Dependencies installed.'

# --- 3. Copy .env.example -> .env (only if .env does not exist) -------------
if (Test-Path $envFile) {
    Write-Host '[setup] .env already exists - skipping copy.'
} else {
    Copy-Item $envExample $envFile
    Write-Host '[setup] Copied .env.example to .env'
    Write-Host '[setup] Edit .env to override FX rates, ports, or CORS origins.'
}

# --- 4. Write frontend config for local dev ----------------------------------
$configJs = Join-Path $projectRoot 'frontend\config.js'
Set-Content -Path $configJs -Value 'window.__MUAMBA_API__ = "http://localhost:8000";'
Write-Host '[setup] Written frontend/config.js for local dev (API → http://localhost:8000).'

Write-Host ''
Write-Host 'Setup complete. Run dev servers with:'
Write-Host '  powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1'
