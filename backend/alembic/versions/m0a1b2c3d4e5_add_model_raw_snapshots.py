"""raw tier — model_raw_snapshots (Karpathy 온톨로지 불변 원본)

Revision ID: m0a1b2c3d4e5
Revises: l0a1b2c3d4e5
Create Date: 2026-06-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "m0a1b2c3d4e5"
down_revision: Union[str, None] = "l0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "model_raw_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("external_id", sa.String(length=300), nullable=False),
        sa.Column("raw_title", sa.Text(), nullable=True),
        sa.Column("raw_abstract", sa.Text(), nullable=True),
        sa.Column("raw_authors", sa.Text(), nullable=True),
        sa.Column("raw_url", sa.Text(), nullable=True),
        sa.Column("raw_metadata", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("item_id", "content_hash", name="uq_raw_item_hash"),
    )
    op.create_index("ix_model_raw_snapshots_item_id", "model_raw_snapshots", ["item_id"])
    op.create_index("ix_model_raw_snapshots_content_hash", "model_raw_snapshots", ["content_hash"])


def downgrade() -> None:
    op.drop_index("ix_model_raw_snapshots_content_hash", table_name="model_raw_snapshots")
    op.drop_index("ix_model_raw_snapshots_item_id", table_name="model_raw_snapshots")
    op.drop_table("model_raw_snapshots")
