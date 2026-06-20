"""lineage_edges 편집 가능 — origin/status/created_by/note (Phase 3 지식 그래프).

자동 계산 엣지(auto)와, 사람이 직접 그린 자유 엣지(manual), Arca 추정(arca, confirm 대기)
을 구분하기 위한 컬럼 추가. 기존 행은 origin=auto / status=confirmed 로 채워진다.

Revision ID: s0a1b2c3d4e5
Revises: r0a1b2c3d4e5
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "s0a1b2c3d4e5"
down_revision: Union[str, None] = "r0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # origin: auto(계산됨) | manual(사람이 그림) | arca(AI 추정)
    op.add_column(
        "lineage_edges",
        sa.Column("origin", sa.String(length=10), nullable=False, server_default="auto"),
    )
    # status: confirmed(확정) | suggested(AI 제안 — confirm 대기)
    op.add_column(
        "lineage_edges",
        sa.Column("status", sa.String(length=10), nullable=False, server_default="confirmed"),
    )
    op.add_column(
        "lineage_edges",
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("lineage_edges", sa.Column("note", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("lineage_edges", "note")
    op.drop_column("lineage_edges", "created_by")
    op.drop_column("lineage_edges", "status")
    op.drop_column("lineage_edges", "origin")
