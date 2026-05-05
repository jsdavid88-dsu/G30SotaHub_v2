"""Item groups for unifying same research across sources

Revision ID: 003_item_groups
Revises: 002_feed_items
Create Date: 2026-04-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "003_item_groups"
down_revision: Union[str, None] = "002_feed_items"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "item_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("fingerprint", sa.String(200), nullable=False),
        sa.Column("canonical_name", sa.String(500)),
        sa.Column("primary_item_id", sa.Integer(), sa.ForeignKey("items.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_item_groups_fp", "item_groups", ["fingerprint"], unique=True)

    # SQLite requires batch mode for adding FK columns
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "group_id",
                sa.Integer(),
                sa.ForeignKey("item_groups.id", ondelete="SET NULL"),
                nullable=True,
            )
        )
        batch_op.create_index("ix_items_group_id", ["group_id"])


def downgrade() -> None:
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.drop_index("ix_items_group_id")
        batch_op.drop_column("group_id")
    op.drop_index("ix_item_groups_fp", table_name="item_groups")
    op.drop_table("item_groups")
