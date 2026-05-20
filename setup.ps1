# G30SotaHub v2 — One-shot Setup Script (Windows)
# 처음 클론 후 1회 실행. 그 다음부터는 .\start.ps1 만 사용.

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "=== G30SotaHub v2 Setup ===" -ForegroundColor Cyan
Write-Host "프로젝트 루트: $ProjectRoot" -ForegroundColor Gray
Write-Host ""

# 1) Prereqs check
Write-Host "[1/6] 사전 도구 확인..." -ForegroundColor Yellow
$missing = @()
foreach ($cmd in @('python', 'node', 'npm', 'docker')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { $missing += $cmd }
}
if ($missing.Count -gt 0) {
    Write-Host "  누락: $($missing -join ', ')" -ForegroundColor Red
    Write-Host "  Python 3.12+, Node 22+, Docker Desktop 설치 후 다시 실행하세요." -ForegroundColor Red
    exit 1
}
$pyVer = (python --version 2>&1).ToString()
$nodeVer = (node --version 2>&1).ToString()
$dockerVer = (docker --version 2>&1).ToString()
Write-Host "  ✓ $pyVer / $nodeVer / $dockerVer" -ForegroundColor Green

# 2) .env
Write-Host "[2/6] .env 확인..." -ForegroundColor Yellow
if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
    Write-Host "  ✓ .env.example → .env 복사됨" -ForegroundColor Green
    Write-Host "  ⚠️  .env 를 편집하세요 (Google OAuth 키 등). DEBUG=true 면 dev-login 으로 OAuth 없이도 사용 가능." -ForegroundColor Yellow
    Write-Host "     Enter 누르면 메모장이 열립니다. 편집 후 저장·닫기." -ForegroundColor Yellow
    Read-Host "  계속하려면 Enter"
    notepad .env
    Read-Host "  편집 완료 후 Enter"
} else {
    Write-Host "  ✓ .env 이미 존재 (그대로 사용)" -ForegroundColor Green
}

# 3) Postgres (Docker)
Write-Host "[3/6] PostgreSQL 컨테이너 기동..." -ForegroundColor Yellow
docker compose up -d db | Out-Null
Write-Host "  ✓ db 컨테이너 시작" -ForegroundColor Green
Write-Host "  ⏳ healthy 대기 중 (최대 30초)..." -ForegroundColor Gray
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    $health = (docker inspect --format='{{.State.Health.Status}}' g30sotahub_v2-db-1 2>$null)
    if (-not $health) { $health = (docker inspect --format='{{.State.Health.Status}}' G30SotaHub_v2-db-1 2>$null) }
    if ($health -eq 'healthy') { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if ($ready) {
    Write-Host "  ✓ db healthy" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  db healthy 확인 못함, 그대로 진행 (수동 확인: docker compose ps)" -ForegroundColor Yellow
}

# 4) Backend
Write-Host "[4/6] Backend 셋업..." -ForegroundColor Yellow
Push-Location backend
if (-not (Test-Path .venv)) {
    python -m venv .venv
    Write-Host "  ✓ venv 생성됨" -ForegroundColor Green
}
& .\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
& .\.venv\Scripts\pip.exe install -r requirements.txt --quiet
Write-Host "  ✓ pip install 완료" -ForegroundColor Green

# DATABASE_URL 환경변수로 alembic 실행 (docker db 가 5432 에 떠있음)
$env:DATABASE_URL = "postgresql+asyncpg://hub:hub@localhost:5432/hub"
& .\.venv\Scripts\alembic.exe upgrade head
Write-Host "  ✓ alembic upgrade head 완료" -ForegroundColor Green

if (Test-Path seed.py) {
    & .\.venv\Scripts\python.exe seed.py
    Write-Host "  ✓ seed.py 실행 완료" -ForegroundColor Green
}
Pop-Location

# 5) Frontend
Write-Host "[5/6] Frontend 셋업..." -ForegroundColor Yellow
Push-Location frontend
npm install --silent
Write-Host "  ✓ npm install 완료" -ForegroundColor Green
Pop-Location

# 6) Done
Write-Host ""
Write-Host "=== Setup 완료 ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "이제 .\start.ps1 로 실행하세요." -ForegroundColor Green
Write-Host "  - Backend:  http://localhost:8011  (API docs: /api/docs)"
Write-Host "  - Frontend: http://localhost:3030"
Write-Host "  - DB:       localhost:5432 (user=hub, pass=hub, db=hub)"
Write-Host ""
Write-Host "다음 단계: PLAN.md (Phase 1 — DB 스키마 마이그레이션)"
