from pathlib import Path

from pydantic_settings import BaseSettings

# Issue #3: pydantic-settings 의 env_file 은 cwd 기준 상대경로 → backend/ 에서
# 띄우면 backend/.env 를 찾는데 실제 .env 는 프로젝트 루트. 절대경로로 고정.
# config.py 위치: <root>/backend/app/config.py → parent x3 = <root>
_ENV_FILE = str(Path(__file__).resolve().parent.parent.parent / ".env")


class Settings(BaseSettings):
    # App
    APP_NAME: str = "glocal30hub"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://hub:hub@db:5432/hub"

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8011/api/v1/auth/callback"

    # Session
    SECRET_KEY: str = "change-me-in-production"
    SESSION_MAX_AGE: int = 86400 * 7  # 7 days

    # Encryption key for sensitive data (Fernet, base64-encoded 32-byte key)
    ENCRYPTION_KEY: str = ""

    # Google Calendar
    GOOGLE_CALENDAR_ENABLED: bool = True

    # Web Push (VAPID)
    VAPID_PRIVATE_KEY: str = ""
    VAPID_PUBLIC_KEY: str = ""
    VAPID_SUBJECT: str = "mailto:admin@glocal30hub.com"

    # Frontend
    FRONTEND_URL: str = "http://localhost:3030"

    # =========================================================================
    # VFX SOTA Monitor 통합 설정 (vfx-sota-monitor 흡수)
    # =========================================================================

    # External API tokens (optional, 비워두면 해당 소스 스킵)
    github_token: str = ""
    hf_token: str = ""
    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    reddit_user_agent: str = "g30sotahub-v2"

    # Admin token — AI Cluster Worker 가 Hub API 호출 시 인증 (Phase 1-2 까지 한정)
    admin_token: str = "change-me-in-production"

    # Crawl4AI / Firecrawl 옵션
    firecrawl_base_url: str = "http://localhost:3002"
    firecrawl_enabled: bool = False  # 기본 OFF (Crawl4AI 가 메인)

    # Ollama (단일 5090 PC 운용 시 localhost, 분산 운용 시 Tailscale IP)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "gemma4:26b"

    # NAS / Storage (Phase 3 영상 첨부)
    nas_base_path: str = ""  # NAS UNC(\\\\host\\share\\..) 또는 드라이브. 설정 시 storage_base_path 보다 우선. 비면 storage_base_path → backend/uploads/ fallback

    # Phase 2.5 — 첨부 storage base.
    # 지금: ./backend/uploads/ (개발). 나중 NAS: M:\sota_files\
    # NAS 이전 시 robocopy + env 변경만으로 끝 (DB 변경 X).
    storage_base_path: str = "./backend/uploads/"

    # APScheduler 토글 (테스트 / alembic 실행 시 비활성화)
    scheduler_enabled: bool = True

    # CORS 추가 (VFX 프론트가 별도 포트에서 도는 경우 대비, 기본은 Hub 와 동일)
    cors_extra_origins: list[str] = []

    # Local Deep Research (LDR) — agentic 발견 엔진 (별도 설치, run_deep_research.py 가 호출)
    # LDR 은 자체 user DB 가 있어 settings_snapshot 조회에 계정 필요.
    ldr_username: str = ""
    ldr_password: str = ""
    ldr_iterations: int = 2
    ldr_questions_per_iteration: int = 3

    model_config = {"env_file": _ENV_FILE, "extra": "ignore"}


settings = Settings()
