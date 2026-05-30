# diagnose.ps1 — #6/#7 진단 도구 래퍼 (5090).
#
# 사용법 (repo 루트에서):
#   .\diagnose.ps1                  # DB 현재 상태 스냅샷 (안전·빠름)
#   .\diagnose.ps1 --crawl          # 크롤 1회 실행 + 소스별 결과 (#7)
#   .\diagnose.ps1 --score          # Gemma 스코어링 1회 + usage 로그 (#6, Ollama 필요)
#   .\diagnose.ps1 --crawl --score  # 둘 다
#
# 출력 전체를 복붙해서 공유하면 진단 가능.
$ErrorActionPreference = "Stop"
Push-Location "$PSScriptRoot\backend"
try {
    if (Test-Path ".\.venv\Scripts\Activate.ps1") {
        & ".\.venv\Scripts\Activate.ps1"
    } else {
        Write-Warning "venv 없음 (backend\.venv). setup.ps1 먼저 실행 필요."
    }
    python diagnose.py @args
} finally {
    Pop-Location
}
