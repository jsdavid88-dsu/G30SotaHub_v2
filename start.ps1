# G30SotaHub v2 — Start Script (Windows)
# DB + Backend + Frontend 를 새 터미널 3개에 띄움.

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

if (-not (Test-Path .env)) {
    Write-Host ".env 가 없습니다. 먼저 .\setup.ps1 을 실행하세요." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path backend\.venv)) {
    Write-Host "backend\.venv 가 없습니다. 먼저 .\setup.ps1 을 실행하세요." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path frontend\node_modules)) {
    Write-Host "frontend\node_modules 가 없습니다. 먼저 .\setup.ps1 을 실행하세요." -ForegroundColor Red
    exit 1
}

Write-Host "=== G30SotaHub v2 Start ===" -ForegroundColor Cyan

# 1) DB
Write-Host "[1/3] PostgreSQL 컨테이너 시작..." -ForegroundColor Yellow
docker compose up -d db | Out-Null
Write-Host "  ✓ db 기동" -ForegroundColor Green

# 2) Backend (새 PowerShell 창)
# Windows 의 ProactorEventLoop 가 async PG driver 와 비호환 (Issue #1).
# run_server.py 가 WindowsSelectorEventLoopPolicy 를 먼저 설정 후 uvicorn.run.
Write-Host "[2/3] Backend 시작 (새 창)..." -ForegroundColor Yellow
$backendCmd = @"
Set-Location '$ProjectRoot\backend'
.\.venv\Scripts\Activate.ps1
Write-Host '=== Backend (run_server.py :8000, --reload) ===' -ForegroundColor Cyan
python run_server.py --reload
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd
Write-Host "  ✓ Backend 창 열림" -ForegroundColor Green

# 3) Frontend (새 PowerShell 창)
Start-Sleep -Seconds 2
Write-Host "[3/3] Frontend 시작 (새 창)..." -ForegroundColor Yellow
$frontendCmd = @"
Set-Location '$ProjectRoot\frontend'
Write-Host '=== Frontend (vite :3000) ===' -ForegroundColor Cyan
npm run dev
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd
Write-Host "  ✓ Frontend 창 열림" -ForegroundColor Green

Write-Host ""
Write-Host "=== 기동 완료 ===" -ForegroundColor Cyan
Write-Host "  - Backend:  http://localhost:8000  (API docs: /api/docs)"
Write-Host "  - Frontend: http://localhost:3000"
Write-Host ""
Write-Host "종료: .\stop.ps1 또는 각 창에서 Ctrl+C"
