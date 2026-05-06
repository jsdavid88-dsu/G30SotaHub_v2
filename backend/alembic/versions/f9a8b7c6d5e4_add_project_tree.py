"""add project_type / parent_id / vfx_category_id (Phase 1: Hub Project ↔ VFX 트리)

Revision ID: f9a8b7c6d5e4
Revises: 005_item_tags
Create Date: 2026-05-08

Phase 1 (마스터 설계서): Project 모델을 3단 트리로 확장.
- umbrella  (예: 모터헤드AIxVFX)
- discipline (예: video_matting) — VFX Category 와 1:1 매핑
- initiative (구체 작업)
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f9a8b7c6d5e4"
down_revision: Union[str, None] = "005_item_tags"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


project_type_enum = sa.Enum(
    "umbrella", "discipline", "initiative",
    name="projecttype",
)


def upgrade() -> None:
    # 1. Enum 타입 생성 (Postgres)
    project_type_enum.create(op.get_bind(), checkfirst=True)

    # 2. Project 테이블에 컬럼 3개 추가
    op.add_column(
        "projects",
        sa.Column(
            "project_type",
            project_type_enum,
            nullable=False,
            server_default="initiative",
        ),
    )
    op.add_column(
        "projects",
        sa.Column("parent_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "projects",
        sa.Column("vfx_category_id", sa.Integer(), nullable=True),
    )

    # 3. FK 제약
    op.create_foreign_key(
        "fk_projects_parent_id",
        "projects", "projects",
        ["parent_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_projects_vfx_category_id",
        "projects", "categories",
        ["vfx_category_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint(
        "uq_projects_vfx_category_id",
        "projects",
        ["vfx_category_id"],
    )

    # 4. 인덱스
    op.create_index("ix_projects_parent_id", "projects", ["parent_id"])
    op.create_index("ix_projects_project_type", "projects", ["project_type"])


def downgrade() -> None:
    op.drop_index("ix_projects_project_type", "projects")
    op.drop_index("ix_projects_parent_id", "projects")
    op.drop_constraint("uq_projects_vfx_category_id", "projects", type_="unique")
    op.drop_constraint("fk_projects_vfx_category_id", "projects", type_="foreignkey")
    op.drop_constraint("fk_projects_parent_id", "projects", type_="foreignkey")
    op.drop_column("projects", "vfx_category_id")
    op.drop_column("projects", "parent_id")
    op.drop_column("projects", "project_type")
    project_type_enum.drop(op.get_bind(), checkfirst=True)
