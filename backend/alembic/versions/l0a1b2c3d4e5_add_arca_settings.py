"""Arca 운영자 커스텀 지침 (arca_settings, singleton)

Revision ID: l0a1b2c3d4e5
Revises: k0a1b2c3d4e5
Create Date: 2026-06-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "l0a1b2c3d4e5"
down_revision: Union[str, None] = "k0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "arca_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("custom_instructions", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
    )


def downgrade() -> None:
    op.drop_table("arca_settings")
