"""vfx-sota-monitor 의 SQLite → G30SotaHub_v2 의 Postgres 마이그레이션.

실행 전 준비
1. vfx-sota-monitor/backend/data/vfx_sota.db 를 G30SotaHub_v2/backend/data/ 로 복사
2. G30SotaHub_v2 백엔드는 Postgres 가 떠있어야 함 (docker compose up -d db)
3. alembic upgrade head + seed.py 가 이미 끝나야 함 (categories 10개 시드됨)

실행:
    cd backend
    python scripts/migrate_vfx_sqlite.py

테이블 매핑
- categories          → 그대로 (slug 충돌 시 SQLite 데이터 우선)
- items               → 그대로
- item_categories     → 그대로
- item_groups         → 그대로
- feed_items          → 그대로
- lineage_edges       → 그대로
- submissions         → 그대로
- crawl_runs          → 그대로
- comments            → item_comments (충돌 회피, ItemComment 모델로 이전)
- category_suggestions → 그대로
"""
import asyncio
import json
import sqlite3
import sys
from pathlib import Path

from sqlalchemy import select, text

# 프로젝트 root 의 backend 안에서 실행한다고 가정
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal, async_session  # noqa: E402
from app.models import (  # noqa: E402
    Category, Item, ItemCategory, ItemGroup, LineageEdge,
    FeedItem, Submission, ItemComment, CrawlRun, CategorySuggestion,
)


SQLITE_PATH = Path(__file__).resolve().parent.parent / "data" / "vfx_sota.db"


# (sqlite_table, model_class) — 순서 중요 (FK 의존성)
TABLE_MAP = [
    ("categories", Category),
    ("item_groups", ItemGroup),
    ("items", Item),
    ("item_categories", ItemCategory),
    ("lineage_edges", LineageEdge),
    ("feed_items", FeedItem),
    ("submissions", Submission),
    ("comments", ItemComment),  # 테이블명 변경: comments → item_comments
    ("crawl_runs", CrawlRun),
    ("category_suggestions", CategorySuggestion),
]


def _decode_row(row: sqlite3.Row) -> dict:
    """SQLite row 를 dict 로 변환 + JSON 컬럼 자동 파싱."""
    data = dict(row)
    for key, value in list(data.items()):
        if isinstance(value, str) and len(value) > 0 and value[0] in ("[", "{"):
            try:
                data[key] = json.loads(value)
            except json.JSONDecodeError:
                pass
    return data


async def migrate():
    if not SQLITE_PATH.exists():
        print(f"❌ SQLite 파일 없음: {SQLITE_PATH}")
        print("   먼저 vfx-sota-monitor/backend/data/vfx_sota.db 를 여기로 복사하세요.")
        return

    sqlite_db = sqlite3.connect(SQLITE_PATH)
    sqlite_db.row_factory = sqlite3.Row

    total_inserted = 0
    total_skipped = 0

    async with SessionLocal() as pg:
        for sqlite_table, Model in TABLE_MAP:
            cur = sqlite_db.cursor()
            try:
                cur.execute(f"SELECT * FROM {sqlite_table}")
            except sqlite3.OperationalError:
                print(f"  [skip] {sqlite_table} (SQLite 테이블 없음)")
                continue

            rows = cur.fetchall()
            if not rows:
                print(f"  [empty] {sqlite_table}")
                continue

            inserted = 0
            skipped = 0
            for row in rows:
                data = _decode_row(row)

                # categories 는 slug 가 unique → 이미 시드된 거면 skip
                if Model is Category:
                    existing = await pg.execute(
                        select(Category).where(Category.slug == data.get("slug"))
                    )
                    if existing.scalar_one_or_none():
                        skipped += 1
                        continue

                try:
                    obj = Model(**data)
                    pg.add(obj)
                    inserted += 1
                except Exception as e:
                    print(f"    ⚠️  {sqlite_table} row insert 실패: {e}")
                    skipped += 1

            try:
                await pg.commit()
                print(f"  ✓ {sqlite_table:<25} → {Model.__tablename__:<25}  insert {inserted:3d}, skip {skipped:3d}")
                total_inserted += inserted
                total_skipped += skipped
            except Exception as e:
                await pg.rollback()
                print(f"  ❌ {sqlite_table}: {e}")
                total_skipped += inserted

        # Integer PK 시퀀스 갱신 (Postgres autoincrement)
        seq_tables = [
            ("categories", "id"),
            ("items", "id"),
            ("item_groups", "id"),
            ("lineage_edges", "id"),
            ("feed_items", "id"),
            ("submissions", "id"),
            ("item_comments", "id"),
            ("crawl_runs", "id"),
            ("category_suggestions", "id"),
        ]
        print("\n=== 시퀀스 갱신 ===")
        for tbl, col in seq_tables:
            try:
                await pg.execute(text(
                    f"SELECT setval(pg_get_serial_sequence('{tbl}', '{col}'), "
                    f"COALESCE((SELECT MAX({col}) FROM {tbl}), 1))"
                ))
                print(f"  ✓ {tbl}.{col}_seq")
            except Exception as e:
                print(f"  ⚠️  {tbl}: {e}")
        await pg.commit()

    sqlite_db.close()
    print(f"\n[완료] 총 {total_inserted}건 삽입, {total_skipped}건 skip")


if __name__ == "__main__":
    asyncio.run(migrate())
