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


@asynccontextmanager
async def lifespan(app: FastAPI):
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
    "http://localhost:3000",
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
    return {"status": "ok", "app": settings.APP_NAME}
