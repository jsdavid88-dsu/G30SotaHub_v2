"""ArcaSetting (singleton) 접근 헬퍼."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ArcaSetting


async def get_or_create_setting(db: AsyncSession) -> ArcaSetting:
    """singleton(id=1) 조회 또는 생성."""
    s = await db.get(ArcaSetting, 1)
    if s is None:
        s = ArcaSetting(id=1, custom_instructions=None)
        db.add(s)
        await db.commit()
        await db.refresh(s)
    return s


async def get_custom_instructions(db: AsyncSession) -> str | None:
    """Arca 운영자 커스텀 지침 (없으면 None). night_batch/score/wiki 가 사용."""
    s = await db.get(ArcaSetting, 1)
    if s is None or not s.custom_instructions or not s.custom_instructions.strip():
        return None
    return s.custom_instructions.strip()
