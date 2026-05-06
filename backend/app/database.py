from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

# Issue #4: pool_pre_ping + pool_recycle — idle connection 회수 후 첫 쿼리에서
# ConnectionDoesNotExistError / WinError 64 발생 방지.
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_recycle=300,
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# VFX-origin 코드는 SessionLocal 이름으로 import → alias 제공
SessionLocal = async_session


async def get_db():
    async with async_session() as session:
        yield session
