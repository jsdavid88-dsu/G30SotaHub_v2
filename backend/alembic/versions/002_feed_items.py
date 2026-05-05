"""Feed items table

Revision ID: 002_feed_items
Revises: 001_initial
Create Date: 2026-04-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "002_feed_items"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "feed_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("external_id", sa.String(400), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("excerpt", sa.Text()),
        sa.Column("content_md", sa.Text()),
        sa.Column("image_url", sa.Text()),
        sa.Column("author", sa.Text()),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("discovered_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("tags", sa.JSON(), default=list),
        sa.Column("feed_metadata", sa.JSON(), default=dict),
        sa.Column("is_saved", sa.Boolean(), default=False),
        sa.Column("saved_at", sa.DateTime(timezone=True)),
        sa.Column(
            "promoted_item_id",
            sa.Integer(),
            sa.ForeignKey("items.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.UniqueConstraint("source", "external_id", name="uq_feed_source_ext"),
    )
    op.create_index("ix_feed_items_source", "feed_items", ["source"])
    op.create_index("ix_feed_items_is_saved", "feed_items", ["is_saved"])


def downgrade() -> None:
    op.drop_table("feed_items")
