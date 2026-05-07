"""Phase 1 통합: Hub SotaItem ↔ VFX Item 단일 모델로 합침

Revision ID: g0a1b2c3d4e5
Revises: f9a8b7c6d5e4
Create Date: 2026-05-07

마스터 설계서 §5: VFX Item 을 unified 로 promote, Hub sota_items 흡수.

변경 내용:
1. items 테이블에 통합 필드 추가:
   - description, wiki_body (Karpathy 온톨로지)
   - refs (JSONB), confidence_status, version
   - lifecycle_status, replaced_by_id, deprecated_at, deprecated_reason
   - project_id (FK → projects.id)

2. 기존 sota_items 행을 items 로 마이그레이션:
   - source = 'manual', external_id = 'sota_legacy_<uuid>'

3. sota_assignments.sota_item_id 칼럼:
   - UUID → Integer FK (items.id) 변경
   - 기존 UUID 값을 items.external_id 통해 매핑

4. sota_items 테이블 drop
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "g0a1b2c3d4e5"
down_revision: Union[str, None] = "f9a8b7c6d5e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


lifecycle_enum = sa.Enum(
    "research", "dev", "testing", "production", "deprecated",
    name="lifecyclestatus",
)
confidence_enum = sa.Enum(
    "verified", "stale", "contradicted", "unverified",
    name="confidencestatus",
)


def upgrade() -> None:
    bind = op.get_bind()

    # 0. Enum 타입 생성
    lifecycle_enum.create(bind, checkfirst=True)
    confidence_enum.create(bind, checkfirst=True)

    # 1. items 테이블 확장 (통합 필드 추가)
    op.add_column("items", sa.Column("description", sa.String(length=500), nullable=True))
    op.add_column("items", sa.Column("wiki_body", sa.Text(), nullable=True))
    op.add_column(
        "items",
        sa.Column(
            "confidence_status", confidence_enum,
            nullable=False, server_default="unverified",
        ),
    )
    op.add_column("items", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column(
        "items",
        sa.Column(
            "refs", postgresql.JSONB(astext_type=sa.Text()),
            nullable=False, server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "items",
        sa.Column(
            "lifecycle_status", lifecycle_enum,
            nullable=False, server_default="research",
        ),
    )
    op.add_column("items", sa.Column("replaced_by_id", sa.Integer(), nullable=True))
    op.add_column("items", sa.Column("deprecated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("items", sa.Column("deprecated_reason", sa.Text(), nullable=True))
    op.add_column(
        "items",
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    # 2. FK 제약 추가
    op.create_foreign_key(
        "fk_items_replaced_by_id",
        "items", "items",
        ["replaced_by_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_items_project_id",
        "items", "projects",
        ["project_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_items_replaced_by_id", "items", ["replaced_by_id"])
    op.create_index("ix_items_project_id", "items", ["project_id"])

    # 3. 기존 sota_items 행 → items 마이그레이션
    #    UUID 보존: external_id = 'sota_legacy_' || sota_items.id
    op.execute("""
        INSERT INTO items (
            source, external_id, title, abstract, url,
            published_at, discovered_at,
            item_metadata, lifecycle_status, confidence_status, version, refs,
            keyword_score, llm_score, status, free_tags
        )
        SELECT
            'manual',
            'sota_legacy_' || id::text,
            title,
            summary,
            url,
            published_at,
            COALESCE(created_at, NOW()),
            '{}'::json,
            'research',
            'unverified',
            1,
            CASE WHEN url IS NOT NULL THEN jsonb_build_object('legacy_url', url)
                 ELSE '{}'::jsonb END,
            0, 0, 'new', '[]'::json
        FROM sota_items
        WHERE NOT EXISTS (
            SELECT 1 FROM items i WHERE i.external_id = 'sota_legacy_' || sota_items.id::text
        )
    """)

    # 4. sota_assignments.sota_item_id 칼럼 타입 변경 (UUID → int)
    #    a. 임시 칼럼 추가
    op.add_column(
        "sota_assignments",
        sa.Column("sota_item_id_int", sa.Integer(), nullable=True),
    )

    #    b. 기존 UUID → int 매핑 채우기
    op.execute("""
        UPDATE sota_assignments sa
        SET sota_item_id_int = i.id
        FROM items i
        WHERE i.external_id = 'sota_legacy_' || sa.sota_item_id::text
    """)

    #    c. 기존 FK 제약 + UUID 칼럼 drop (제약 이름은 alembic 자동 생성 패턴 추정)
    op.drop_constraint(
        "sota_assignments_sota_item_id_fkey",
        "sota_assignments",
        type_="foreignkey",
    )
    op.drop_column("sota_assignments", "sota_item_id")

    #    d. 임시 int 칼럼을 sota_item_id 로 rename
    op.alter_column(
        "sota_assignments",
        "sota_item_id_int",
        new_column_name="sota_item_id",
        nullable=False,  # 매핑 완료 후 NOT NULL 강제
    )

    #    e. 새 FK + 인덱스
    op.create_foreign_key(
        "fk_sota_assignments_sota_item_id",
        "sota_assignments", "items",
        ["sota_item_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_sota_assignments_sota_item_id",
        "sota_assignments",
        ["sota_item_id"],
    )

    # 5. sota_items 테이블 drop
    op.drop_index("ix_sota_items_published_at", table_name="sota_items")
    op.drop_table("sota_items")


def downgrade() -> None:
    """롤백 (데이터 일부 손실 가능 — sota_items 의 별도 created_at 등).

    - sota_items 테이블 재생성
    - items.external_id LIKE 'sota_legacy_%' 인 행을 sota_items 로 복구
    - sota_assignments.sota_item_id 를 UUID 로 되돌림
    """
    # 1. sota_items 재생성
    op.create_table(
        "sota_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("source", sa.String(length=255), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary", sa.String(), nullable=True),
        sa.Column("url", sa.String(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
    )
    op.create_index("ix_sota_items_published_at", "sota_items", ["published_at"])

    # 2. items → sota_items 일부 복구 (external_id LIKE 'sota_legacy_%')
    op.execute("""
        INSERT INTO sota_items (id, title, source, published_at, summary, url, created_at)
        SELECT
            CAST(SUBSTRING(external_id FROM 14) AS uuid),
            title,
            NULL,
            published_at,
            abstract,
            url,
            discovered_at
        FROM items
        WHERE external_id LIKE 'sota_legacy_%'
    """)

    # 3. sota_assignments.sota_item_id 복원 (int → UUID)
    op.add_column(
        "sota_assignments",
        sa.Column("sota_item_id_uuid", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.execute("""
        UPDATE sota_assignments sa
        SET sota_item_id_uuid = CAST(SUBSTRING(i.external_id FROM 14) AS uuid)
        FROM items i
        WHERE i.id = sa.sota_item_id
          AND i.external_id LIKE 'sota_legacy_%'
    """)

    op.drop_index("ix_sota_assignments_sota_item_id", table_name="sota_assignments")
    op.drop_constraint(
        "fk_sota_assignments_sota_item_id",
        "sota_assignments",
        type_="foreignkey",
    )
    op.drop_column("sota_assignments", "sota_item_id")
    op.alter_column(
        "sota_assignments",
        "sota_item_id_uuid",
        new_column_name="sota_item_id",
        nullable=False,
    )
    op.create_foreign_key(
        "sota_assignments_sota_item_id_fkey",
        "sota_assignments", "sota_items",
        ["sota_item_id"], ["id"],
        ondelete="CASCADE",
    )

    # 4. items 칼럼 drop
    op.drop_index("ix_items_project_id", "items")
    op.drop_index("ix_items_replaced_by_id", "items")
    op.drop_constraint("fk_items_project_id", "items", type_="foreignkey")
    op.drop_constraint("fk_items_replaced_by_id", "items", type_="foreignkey")
    op.drop_column("items", "project_id")
    op.drop_column("items", "deprecated_reason")
    op.drop_column("items", "deprecated_at")
    op.drop_column("items", "replaced_by_id")
    op.drop_column("items", "lifecycle_status")
    op.drop_column("items", "refs")
    op.drop_column("items", "version")
    op.drop_column("items", "confidence_status")
    op.drop_column("items", "wiki_body")
    op.drop_column("items", "description")

    # 5. Enum 정리
    confidence_enum.drop(op.get_bind(), checkfirst=True)
    lifecycle_enum.drop(op.get_bind(), checkfirst=True)
