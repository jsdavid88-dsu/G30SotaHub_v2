"""Submissions table for user-submitted URLs and keywords

Revision ID: 004_submissions
Revises: 003_item_groups
Create Date: 2026-04-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "004_submissions"
down_revision: Union[str, None] = "003_item_groups"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "submissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("submitted_by", sa.String(100)),
        sa.Column("input_type", sa.String(20), nullable=False),
        sa.Column("input_value", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("reject_reason", sa.Text()),
        sa.Column("result_item_id", sa.Integer(), sa.ForeignKey("items.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_submissions_status", "submissions", ["status"])


def downgrade() -> None:
    op.drop_index("ix_submissions_status", table_name="submissions")
    op.drop_table("submissions")
