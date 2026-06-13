"""NotificationType enum 에 연구 사이클 값 추가 (model_comment/model_confirm/sota_review).

Revision ID: p0a1b2c3d4e5
Revises: o0a1b2c3d4e5
"""
from typing import Sequence, Union

from alembic import op

revision: str = "p0a1b2c3d4e5"
down_revision: Union[str, None] = "o0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PG enum 값 추가 (ADD VALUE 는 transactional 안전, IF NOT EXISTS 로 멱등).
    for v in ("model_comment", "model_confirm", "sota_review"):
        op.execute(f"ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS '{v}'")


def downgrade() -> None:
    # PG 는 enum 값 제거 미지원 — no-op
    pass
