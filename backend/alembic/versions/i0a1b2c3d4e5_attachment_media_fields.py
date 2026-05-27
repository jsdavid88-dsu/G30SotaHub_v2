"""Phase 2.5 A — 미디어 첨부 + 뷰어 (Attachment 확장)

Revision ID: i0a1b2c3d4e5
Revises: h0a1b2c3d4e5
Create Date: 2026-05-21

추가:
- AttachmentOwnerType enum 에 'project_message' 값 추가
- Attachment 테이블 칼럼: storage_relpath, media_type, mime, width, height,
  duration_sec, thumbnail_relpath
- 기존 file_url 은 nullable 로 변경 (legacy — 신규는 storage_relpath 사용)

원칙: storage 는 STORAGE_BASE_PATH(env) + storage_relpath 로 runtime join.
NAS 이전 시 파일 robocopy + env 변경만으로 끝. DB 변경 X.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "i0a1b2c3d4e5"
down_revision: Union[str, None] = "h0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. AttachmentOwnerType enum 에 'project_message' 값 추가
    #    PG 12+ 부터 ALTER TYPE ADD VALUE 가 transactional 안전.
    op.execute("ALTER TYPE attachmentownertype ADD VALUE IF NOT EXISTS 'project_message'")

    # 2. Attachment 신규 칼럼들
    op.add_column("attachments", sa.Column("storage_relpath", sa.String(length=500), nullable=True))
    op.add_column("attachments", sa.Column("media_type", sa.String(length=20), nullable=True))
    op.add_column("attachments", sa.Column("mime", sa.String(length=100), nullable=True))
    op.add_column("attachments", sa.Column("width", sa.Integer(), nullable=True))
    op.add_column("attachments", sa.Column("height", sa.Integer(), nullable=True))
    op.add_column("attachments", sa.Column("duration_sec", sa.Float(), nullable=True))
    op.add_column("attachments", sa.Column("thumbnail_relpath", sa.String(length=500), nullable=True))

    # 3. file_url 을 nullable 로 (legacy 호환)
    op.alter_column("attachments", "file_url", existing_type=sa.String(), nullable=True)

    # 4. storage_relpath 인덱스 (조회 최적화)
    op.create_index("ix_attachments_storage_relpath", "attachments", ["storage_relpath"])


def downgrade() -> None:
    op.drop_index("ix_attachments_storage_relpath", table_name="attachments")
    op.alter_column("attachments", "file_url", existing_type=sa.String(), nullable=False)
    op.drop_column("attachments", "thumbnail_relpath")
    op.drop_column("attachments", "duration_sec")
    op.drop_column("attachments", "height")
    op.drop_column("attachments", "width")
    op.drop_column("attachments", "mime")
    op.drop_column("attachments", "media_type")
    op.drop_column("attachments", "storage_relpath")
    # enum value 제거는 PG 가 지원 안 함 — 값 남김 (해되지 않음)
