"""Phase 2.5 B/C — 이미지/영상 주석 (annotations, annotation_replies)

Revision ID: j0a1b2c3d4e5
Revises: i0a1b2c3d4e5
Create Date: 2026-05-29

첨부(Attachment) 위에 도형(pin/box/arrow/freedraw)을 그리고 코멘트.
geometry 는 0~1 비율 좌표 (해상도 독립). timecode_ms 는 영상용 (Phase 2.5 C 대비).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "j0a1b2c3d4e5"
down_revision: Union[str, None] = "i0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "annotations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("attachment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="pin"),
        sa.Column("geometry", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("timecode_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["attachment_id"], ["attachments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_annotations_attachment_id", "annotations", ["attachment_id"])
    op.create_index("ix_annotations_author_id", "annotations", ["author_id"])

    op.create_table(
        "annotation_replies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("annotation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["annotation_id"], ["annotations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_annotation_replies_annotation_id_created",
        "annotation_replies",
        ["annotation_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_annotation_replies_annotation_id_created", table_name="annotation_replies")
    op.drop_table("annotation_replies")
    op.drop_index("ix_annotations_author_id", table_name="annotations")
    op.drop_index("ix_annotations_attachment_id", table_name="annotations")
    op.drop_table("annotations")
