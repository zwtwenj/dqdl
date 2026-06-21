<# Use "PowerShell" to run this script. #>
$root = $PSScriptRoot
$hasNodeModules = Test-Path "$root\dqdl-server\node_modules"
$hasWebModules = Test-Path "$root\dqdl-web\node_modules"

# Change console to UTF-8 for spawned windows
chcp 65001 >$null

Write-Host "=== DQDL Launcher ===" -ForegroundColor Yellow

if (-not $hasNodeModules) {
    Write-Host "[!] dqdl-server: node_modules missing, running npm install..." -ForegroundColor Magenta
    Push-Location "$root\dqdl-server"
    npm install
    Pop-Location
}

if (-not $hasWebModules) {
    Write-Host "[!] dqdl-web: node_modules missing, running npm install..." -ForegroundColor Magenta
    Push-Location "$root\dqdl-web"
    npm install
    Pop-Location
}

Write-Host "[1/3] Starting dqdl-agent (localhost:5000)..." -ForegroundColor Cyan
Start-Process powershell -WorkingDirectory "$root\dqdl-agent" -ArgumentList "-NoExit", "-Command", "chcp 65001 >`$null; python app.py"

Write-Host "[2/3] Starting dqdl-server (localhost:3000)..." -ForegroundColor Cyan
Start-Process powershell -WorkingDirectory "$root\dqdl-server" -ArgumentList "-NoExit", "-Command", "chcp 65001 >`$null; npm run start:dev"

Write-Host "[3/3] Starting dqdl-web (localhost:5173)..." -ForegroundColor Cyan
Start-Process powershell -WorkingDirectory "$root\dqdl-web" -ArgumentList "-NoExit", "-Command", "chcp 65001 >`$null; npm run dev"

Write-Host ""
Write-Host "All 3 services launched. Open http://localhost:5173 to play." -ForegroundColor Green
Write-Host "Press any key to close this launcher (services keep running)..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
