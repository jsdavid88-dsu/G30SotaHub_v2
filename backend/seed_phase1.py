"""Phase 1 시드 — 모터헤드AIxVFX umbrella + 10개 분야 Project 자동 생성.

- Hub seed.py 와 vfx 카테고리 seed_vfx.py 가 이미 돌아간 상태에서 호출됨
- categories 10개 가 이미 있어야 함
- 각 category 마다 discipline 타입 Project 생성 + vfx_category_id 매핑
- 그 모든 Project 의 parent_id 는 'motorhead-vfx' umbrella

실행:
    cd backend
    python seed_phase1.py
"""
import asyncio
import uuid

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Category, Project, ProjectStatus, ProjectType


# 모터헤드AIxVFX umbrella 의 고정 UUID (재실행 시 충돌 방지)
MOTORHEAD_VFX_UUID = uuid.UUID("00000000-0000-0000-0000-00000000a000")


async def seed_phase1():
    async with SessionLocal() as db:
        # 1. Umbrella Project (모터헤드AIxVFX)
        existing = await db.execute(select(Project).where(Project.id == MOTORHEAD_VFX_UUID))
        umbrella = existing.scalar_one_or_none()
        if umbrella is None:
            umbrella = Project(
                id=MOTORHEAD_VFX_UUID,
                name="모터헤드AIxVFX",
                description="레드캣갱(동서대) × 모터헤드 협업 — VFX AI SOTA 추적·실험·라이프사이클 관리.",
                project_type=ProjectType.umbrella,
                status=ProjectStatus.active,
                parent_id=None,
            )
            db.add(umbrella)
            await db.flush()
            print(f"[add]  umbrella: 모터헤드AIxVFX ({MOTORHEAD_VFX_UUID})")
        else:
            # type/parent 보장 (이전 실행에서 다르게 만들어졌으면 보정)
            umbrella.project_type = ProjectType.umbrella
            umbrella.parent_id = None
            print(f"[ok]   umbrella 이미 존재")

        # 2. 각 VFX Category 마다 discipline Project 자동 생성
        cat_result = await db.execute(select(Category).order_by(Category.display_order))
        categories = cat_result.scalars().all()

        created = 0
        linked = 0
        for cat in categories:
            # 이미 같은 vfx_category_id 로 매핑된 Project 있는지 확인
            existing_q = await db.execute(
                select(Project).where(Project.vfx_category_id == cat.id)
            )
            existing_proj = existing_q.scalar_one_or_none()

            if existing_proj is None:
                proj = Project(
                    name=f"{cat.icon or '📂'} {cat.name_ko}",
                    description=cat.description or f"{cat.name_ko} ({cat.name_en}) 분야의 SOTA 추적·실험.",
                    project_type=ProjectType.discipline,
                    status=ProjectStatus.active,
                    parent_id=umbrella.id,
                    vfx_category_id=cat.id,
                )
                db.add(proj)
                created += 1
                print(f"[add]  discipline: {cat.name_ko} → vfx_category_id={cat.id}")
            else:
                # 보정: parent / type / vfx_category_id 일관성
                existing_proj.parent_id = umbrella.id
                existing_proj.project_type = ProjectType.discipline
                linked += 1

        await db.commit()
        print(f"\n[OK] umbrella 1개 + discipline 신규 {created}개 / 보정 {linked}개")


if __name__ == "__main__":
    asyncio.run(seed_phase1())
