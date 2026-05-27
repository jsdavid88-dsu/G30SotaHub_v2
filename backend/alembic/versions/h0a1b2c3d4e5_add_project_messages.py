"""Phase 2 — 프로젝트 메시지 보드 (project_messages)

Revision ID: h0a1b2c3d4e5
Revises: g0a1b2c3d4e5
Create Date: 2026-05-21

분산된 댓글 (SOTA item, daily block) 을 보완하는 팀 단위 자유 토론 위치.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "h0a1b2c3d4e5"
down_revision: Union[str, None] = "g0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["project_messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_project_messages_project_id_created",
        "project_messages",
        ["project_id", "created_at"],
    )
    op.create_index("ix_project_messages_parent_id", "project_messages", ["parent_id"])
    op.create_index("ix_project_messages_author_id", "project_messages", ["author_id"])


def downgrade() -> None:
    op.drop_index("ix_project_messages_author_id", table_name="project_messages")
    op.drop_index("ix_project_messages_parent_id", table_name="project_messages")
    op.drop_index("ix_project_messages_project_id_created", table_name="project_messages")
    op.drop_table("project_messages")
