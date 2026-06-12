"""연구 기록 — daily_blocks.sota_item_id + item_comments.kind/user_role.

블록을 SOTA 모델에 연결(연구 피드 집계) + 모델 댓글에 컨펌(승인) 종류 추가.

Revision ID: o0a1b2c3d4e5
Revises: n0a1b2c3d4e5
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "o0a1b2c3d4e5"
down_revision: Union[str, None] = "n0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 블록 → 모델 연결 (items.id 는 INTEGER)
    op.add_column("daily_blocks", sa.Column("sota_item_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_daily_blocks_sota_item_id", "daily_blocks", "items",
        ["sota_item_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_daily_blocks_sota_item_id", "daily_blocks", ["sota_item_id"])

    # 모델 댓글에 컨펌 종류 + 역할 스냅샷
    op.add_column("item_comments", sa.Column("kind", sa.String(length=20), nullable=False, server_default="comment"))
    op.add_column("item_comments", sa.Column("user_role", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("item_comments", "user_role")
    op.drop_column("item_comments", "kind")
    op.drop_index("ix_daily_blocks_sota_item_id", table_name="daily_blocks")
    op.drop_constraint("fk_daily_blocks_sota_item_id", "daily_blocks", type_="foreignkey")
    op.drop_column("daily_blocks", "sota_item_id")
