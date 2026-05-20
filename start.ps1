# G30SotaHub v2 — Start Script (Windows, native Postgres)
# Backend + Frontend 를 새 터미널 2개에 띄움. DB 는 native Postgres 가 이미 떠있는 가정.
# Issue #9 fix: 백엔드 시작 전 alembic head 자동 검증 + (확인 후) upgrade.

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

# 1) Postgres reachable 체크 (native Postgres 가정 — localhost:5432)
Write-Host "[1/3] PostgreSQL 연결 확인 (localhost:5432)..." -ForegroundColor Yellow
$pgReady = $false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $iar = $tcp.BeginConnect("localhost", 5432, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(2000, $false)
    if ($ok -and $tcp.Connected) { $pgReady = $true }
    $tcp.Close()
} catch { $pgReady = $false }

if (-not $pgReady) {
    Write-Host "  ⚠️  Postgres 가 localhost:5432 에서 응답 없음." -ForegroundColor Yellow
    Write-Host "      native Postgres 서비스가 떠있는지 확인하세요 (services.msc → postgresql)." -ForegroundColor Yellow
    Write-Host "      또는 docker compose 환경이면: docker compose up -d db" -ForegroundColor Yellow
    $resp = Read-Host "  계속 진행? (y/N)"
    if ($resp -ne 'y' -and $resp -ne 'Y') { exit 1 }
} else {
    Write-Host "  ✓ Postgres 5432 응답 OK" -ForegroundColor Green
}

# 2) Alembic schema 검증 (Issue #9)
Write-Host "[2/3] Alembic schema 검증..." -ForegroundColor Yellow
$env:DATABASE_URL = "postgresql+asyncpg://hub:hub@localhost:5432/hub"

Push-Location backend
$current = & .\.venv\Scripts\alembic.exe current 2>&1 | Out-String
$heads = & .\.venv\Scripts\alembic.exe heads 2>&1 | Out-String

# alembic current/heads 출력에서 revision 추출
# (PowerShell 5.1 호환 — null-coalescing `??` 는 7+ 전용이라 if/else 로 풀어서 사용)
$currentRev = if ($current -match '([a-f0-9_]+)\s*\(head\)|^([a-f0-9_]+)') { if ($matches[1]) { $matches[1] } else { $matches[2] } } else { '' }
$headsRev   = if ($heads   -match '([a-f0-9_]+)\s*\(head\)|^([a-f0-9_]+)') { if ($matches[1]) { $matches[1] } else { $matches[2] } } else { '' }

if ($currentRev -and $headsRev -and ($currentRev -eq $headsRev)) {
    Write-Host "  ✓ Schema OK (rev=$currentRev)" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "  ⚠️  ALEMBIC SCHEMA MISMATCH (Issue #9)" -ForegroundColor Yellow
    Write-Host "      DB current : $currentRev" -ForegroundColor Yellow
    Write-Host "      Head       : $headsRev" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "      이 상태로 시작하면 /api/v1/vfx/items, /api/v1/sota/ 등이 500 응답." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  💾  Phase 1 통합 migration 은 destructive 입니다 (sota_items 테이블 drop)." -ForegroundColor Magenta
    Write-Host "      백업 추천 (native Postgres):" -ForegroundColor Magenta
    Write-Host "         pg_dump -U hub -h localhost hub > backup_before_migrate.sql" -ForegroundColor Magenta
    Write-Host ""
    $resp = Read-Host "  지금 alembic upgrade head 를 실행할까요? (y/N)"
    if ($resp -eq 'y' -or $resp -eq 'Y') {
        & .\.venv\Scripts\alembic.exe upgrade head
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ 마이그레이션 완료" -ForegroundColor Green
        } else {
            Write-Host "  ❌ 마이그레이션 실패 — 백엔드 시작 중단. 로그 확인 후 수동 진행하세요." -ForegroundColor Red
            Pop-Location
            exit 1
        }
    } else {
        Write-Host "  ⏭️   skip — 백엔드는 시작하지만 일부 endpoint 가 500 응답할 수 있음." -ForegroundColor Yellow
    }
}
Pop-Location

# 3) Backend (새 PowerShell 창)
# Windows 의 ProactorEventLoop 가 async PG driver 와 비호환 (Issue #1).
# run_server.py 가 WindowsSelectorEventLoopPolicy 를 먼저 설정 후 uvicorn.run.
Write-Host "[3/3] Backend + Frontend 시작 (새 창 2개)..." -ForegroundColor Yellow
$backendCmd = @"
Set-Location '$ProjectRoot\backend'
.\.venv\Scripts\Activate.ps1
Write-Host '=== Backend (run_server.py :8011, --reload) ===' -ForegroundColor Cyan
python run_server.py --reload
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd
Write-Host "  ✓ Backend 창 열림" -ForegroundColor Green

Start-Sleep -Seconds 2
$frontendCmd = @"
Set-Location '$ProjectRoot\frontend'
Write-Host '=== Frontend (vite :3030) ===' -ForegroundColor Cyan
npm run dev
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd
Write-Host "  ✓ Frontend 창 열림" -ForegroundColor Green

Write-Host ""
Write-Host "=== 기동 완료 ===" -ForegroundColor Cyan
Write-Host "  - Backend:  http://localhost:8011  (API docs: /api/docs, health: /api/health)"
Write-Host "  - Frontend: http://localhost:3030"
Write-Host ""
Write-Host "종료: 각 PowerShell 창에서 Ctrl+C"
