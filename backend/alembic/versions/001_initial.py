"""Initial schema

Revision ID: 001_initial
Revises:
Create Date: 2026-04-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "001_initial"
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(50), nullable=False),
        sa.Column("name_ko", sa.String(100), nullable=False),
        sa.Column("name_en", sa.String(100), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("icon", sa.String(50)),
        sa.Column("keywords", sa.JSON(), default=list),
        sa.Column("github_topics", sa.JSON(), default=list),
        sa.Column("hf_tags", sa.JSON(), default=list),
        sa.Column("subreddits", sa.JSON(), default=list),
        sa.Column("x_accounts", sa.JSON(), default=list),
        sa.Column("current_sota", sa.JSON(), default=list),
        sa.Column("display_order", sa.Integer(), default=0),
    )
    op.create_index("ix_categories_slug", "categories", ["slug"], unique=True)

    op.create_table(
        "items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("external_id", sa.String(300), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("abstract", sa.Text()),
        sa.Column("authors", sa.Text()),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("discovered_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("item_metadata", sa.JSON(), default=dict),
        sa.Column("keyword_score", sa.Integer(), default=0),
        sa.Column("llm_score", sa.Integer(), default=0),
        sa.Column("llm_reason", sa.Text()),
        sa.Column("priority", sa.String(10)),
        sa.Column("status", sa.String(20), default="new"),
        sa.UniqueConstraint("source", "external_id", name="uq_item_source_ext"),
    )
    op.create_index("ix_items_source", "items", ["source"])

    op.create_table(
        "item_categories",
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "lineage_edges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("items.id", ondelete="CASCADE")),
        sa.Column("child_id", sa.Integer(), sa.ForeignKey("items.id", ondelete="CASCADE")),
        sa.Column("relationship_type", sa.String(30)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("parent_id", "child_id", name="uq_lineage_pair"),
    )
    op.create_index("ix_lineage_parent", "lineage_edges", ["parent_id"])
    op.create_index("ix_lineage_child", "lineage_edges", ["child_id"])

    # Issue #2: VFX 의 'comments' 는 Hub 의 daily_blocks 댓글 'comments' 와 충돌.
    # 통합 시 VFX 의 Comment 모델은 ItemComment / item_comments 로 리네임됨
    # (backend/app/models/vfx_comment.py). 마이그레이션도 그에 맞춤.
    op.create_table(
        "item_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id", ondelete="CASCADE")),
        sa.Column("user_id", sa.String(100)),
        sa.Column("user_name", sa.String(100)),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_item_comments_item", "item_comments", ["item_id"])

    op.create_table(
        "crawl_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("items_found", sa.Integer(), default=0),
        sa.Column("items_new", sa.Integer(), default=0),
        sa.Column("error", sa.Text()),
    )
    op.create_index("ix_crawl_runs_source", "crawl_runs", ["source"])


def downgrade() -> None:
    op.drop_table("crawl_runs")
    op.drop_table("item_comments")
    op.drop_table("lineage_edges")
    op.drop_table("item_categories")
    op.drop_table("items")
    op.drop_table("categories")
