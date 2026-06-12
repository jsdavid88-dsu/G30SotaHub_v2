"""AttachmentOwnerType enum 에 'sota_assignment' 값 추가.

SOTA 배정에 테스트 영상/이미지를 직접 첨부 — 업로드는 배정받은 본인 + 운영진.
프레임별 노트는 기존 annotation 시스템(timecode_ms)이 attachment 단위로 그대로 동작.

Revision ID: n0a1b2c3d4e5
Revises: m0a1b2c3d4e5
"""
from typing import Sequence, Union

from alembic import op

revision: str = "n0a1b2c3d4e5"
down_revision: Union[str, None] = "m0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PG 12+ 부터 ALTER TYPE ADD VALUE 가 transactional 안전 (i0a1 과 동일 패턴).
    op.execute("ALTER TYPE attachmentownertype ADD VALUE IF NOT EXISTS 'sota_assignment'")


def downgrade() -> None:
    # PG 는 enum 값 제거 미지원 — no-op (값이 남아있어도 무해)
    pass
