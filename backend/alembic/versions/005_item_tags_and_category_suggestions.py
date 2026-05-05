"""Add free_tags to items + category_suggestions table

Revision ID: 005_item_tags
Revises: 004_submissions
Create Date: 2026-04-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "005_item_tags"
down_revision: Union[str, None] = "004_submissions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Free-form tags on items (JSON array stored as TEXT in SQLite)
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.add_column(sa.Column("free_tags", sa.JSON(), server_default="[]"))

    # Category suggestions from Arca
    op.create_table(
        "category_suggestions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tag", sa.String(100), nullable=False, unique=True),
        sa.Column("item_count", sa.Integer(), default=0),
        sa.Column("suggested_name_ko", sa.String(200)),
        sa.Column("suggested_name_en", sa.String(200)),
        sa.Column("suggested_keywords", sa.JSON(), server_default="[]"),
        sa.Column("arca_reason", sa.Text()),
        sa.Column("status", sa.String(20), server_default="pending"),  # pending/approved/rejected
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
    )


def downgrade() -> None:
    op.drop_table("category_suggestions")
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.drop_column("free_tags")
