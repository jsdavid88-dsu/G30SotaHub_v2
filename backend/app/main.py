"""FastAPI entry point — glocal30Hub + VFX SOTA Monitor 통합."""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.api.v1.router import api_router
from app.config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger(__name__)


async def _check_alembic_head() -> None:
    """Issue #9 fix: DB schema 가 alembic head 와 일치하는지 startup 시 검증.

    불일치 시 logger.error 로 배포 절차 안내. 백엔드는 그래도 시작 (200 으로 health 응답
    가능 — 단, /api/v1/vfx/items 등 신규 칼럼 사용 endpoint 는 500).
    """
    try:
        from pathlib import Path
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        from sqlalchemy import text
        from app.database import engine

        alembic_ini = Path(__file__).resolve().parent.parent / "alembic.ini"
        if not alembic_ini.exists():
            log.warning(f"alembic.ini not found at {alembic_ini} — schema check skipped")
            return

        cfg = Config(str(alembic_ini))
        script = ScriptDirectory.from_config(cfg)
        head_rev = script.get_current_head()

        async with engine.connect() as conn:
            try:
                row = await conn.execute(text("SELECT version_num FROM alembic_version"))
                db_rev = row.scalar()
            except Exception:
                db_rev = None

        if db_rev == head_rev:
            log.info(f"✓ Alembic schema OK (rev={db_rev})")
        else:
            banner = "═" * 70
            log.error(banner)
            log.error("⚠️  ALEMBIC SCHEMA MISMATCH — DB 가 최신 마이그레이션 미적용 상태")
            log.error(f"    DB:   {db_rev or '(no alembic_version table)'}")
            log.error(f"    Head: {head_rev}")
            log.error("")
            log.error("    fix:")
            log.error("      cd backend")
            log.error("      .\\.venv\\Scripts\\activate    # Windows")
            log.error("      alembic upgrade head")
            log.error("")
            log.error("    적용 전 PG 백업 권장 (Phase 1 통합은 destructive):")
            log.error("      pg_dump -U hub -h localhost hub > backup.sql   # native Postgres")
            log.error("")
            log.error("    이 상태로는 /api/v1/vfx/items, /api/v1/sota/ 등이 500 응답함 (Issue #9).")
            log.error(banner)
    except Exception as e:
        log.warning(f"alembic schema check failed (계속 진행): {type(e).__name__}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Issue #9: 시작 시 schema mismatch 검증
    await _check_alembic_head()

    # === VFX 흡수: APScheduler (정기 크롤 + 야간 배치 + 주간 리포트) ===
    # alembic / 테스트 / SCHEDULER_ENABLED=false 시 비활성화
    if settings.scheduler_enabled and os.getenv("DISABLE_SCHEDULER") != "1":
        try:
            from app.jobs import start_scheduler
            start_scheduler()
            log.info("APScheduler 시작 — 정기 크롤 + 야간 배치 + 주간 리포트")
        except Exception as e:
            log.warning(f"Scheduler 시작 실패 (계속 진행): {e}")
    else:
        log.info("APScheduler 비활성화 (SCHEDULER_ENABLED=false 또는 DISABLE_SCHEDULER=1)")

    yield

    try:
        from app.jobs import shutdown_scheduler
        shutdown_scheduler()
    except Exception:
        pass


app = FastAPI(
    title=settings.APP_NAME,
    description="glocal30Hub v2 — R&D Knowledge Graph Platform (lab collaboration + auto SOTA tracking)",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# SessionMiddleware (Authlib OAuth CSRF state)
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)

# CORS
_origins = [
    settings.FRONTEND_URL,
    "http://localhost:5173",
    "http://localhost:3030",  # vite dev (#13)
    "http://localhost:3000",  # legacy default (호환)
] + (settings.cors_extra_origins or [])
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/api/health")
async def health():
    """Health check + Issue #9: alembic schema mismatch 노출.

    schema_ok=false 이면 frontend 가 "마이그레이션 펜딩" 배너 표시 가능.
    """
    schema_ok = True
    db_rev = None
    head_rev = None
    try:
        from pathlib import Path
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        from sqlalchemy import text
        from app.database import engine

        alembic_ini = Path(__file__).resolve().parent.parent / "alembic.ini"
        if alembic_ini.exists():
            cfg = Config(str(alembic_ini))
            head_rev = ScriptDirectory.from_config(cfg).get_current_head()
            async with engine.connect() as conn:
                try:
                    row = await conn.execute(text("SELECT version_num FROM alembic_version"))
                    db_rev = row.scalar()
                except Exception:
                    db_rev = None
            schema_ok = (db_rev == head_rev)
    except Exception:
        pass

    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "schema_ok": schema_ok,
        "alembic_db": db_rev,
        "alembic_head": head_rev,
    }
