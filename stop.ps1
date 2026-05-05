# G30SotaHub v2 — Stop Script
# DB 컨테이너만 정지. backend / frontend 창은 각자 Ctrl+C.

$ErrorActionPreference = "SilentlyContinue"
Set-Location $PSScriptRoot

Write-Host "=== G30SotaHub v2 Stop ===" -ForegroundColor Cyan
docker compose down
Write-Host "  ✓ db 컨테이너 정지" -ForegroundColor Green
Write-Host ""
Write-Host "Backend / Frontend 창은 각자 Ctrl+C 로 종료하세요." -ForegroundColor Yellow
