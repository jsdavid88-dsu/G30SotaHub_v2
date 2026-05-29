"""Phase 2.5 C — attachment fps + 웹 트랜스코딩 프록시

Revision ID: k0a1b2c3d4e5
Revises: j0a1b2c3d4e5
Create Date: 2026-05-29

- fps: 영상 프레임레이트 (프레임 정밀 네비게이션용)
- web_relpath: non-web-safe 원본(ProRes/mkv/avi/hevc)을 H.264 MP4 로 변환한 프록시.
  원본은 항상 보존. 브라우저 재생은 web_relpath 우선.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "k0a1b2c3d4e5"
down_revision: Union[str, None] = "j0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("attachments", sa.Column("fps", sa.Float(), nullable=True))
    op.add_column("attachments", sa.Column("web_relpath", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("attachments", "web_relpath")
    op.drop_column("attachments", "fps")
