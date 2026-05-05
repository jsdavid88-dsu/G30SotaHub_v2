from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# VFX-origin 코드는 SessionLocal 이름으로 import → alias 제공
SessionLocal = async_session


async def get_db():
    async with async_session() as session:
        yield session
