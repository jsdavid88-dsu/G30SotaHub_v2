"""created_at 동결 디폴트 수정 — server_default='now()'(문자열) → now() 함수.

문제: 모델에서 server_default="now()" (문자열)로 선언된 created_at 컬럼은
Postgres 가 테이블 생성 시각의 리터럴 타임스탬프로 동결시킨다('now'::timestamptz 함정).
→ 모든 행이 마이그레이션 시각으로 박혀 created_at 정렬(알림/피드)이 무의미.

해결: 해당 9개 테이블의 created_at DEFAULT 를 now() 함수로 교정.
(기존 행 값은 건드리지 않음 — 시드/구데이터라 무해. 신규 INSERT 부터 실제 시각.)

Revision ID: q0a1b2c3d4e5
Revises: p0a1b2c3d4e5
"""
from typing import Sequence, Union

from alembic import op

revision: str = "q0a1b2c3d4e5"
down_revision: Union[str, None] = "p0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = [
    "attachments", "audit_logs", "notifications", "projects",
    "report_snapshots", "sota_assignments", "tags", "tasks", "users",
]


def upgrade() -> None:
    for t in _TABLES:
        op.execute(f"ALTER TABLE {t} ALTER COLUMN created_at SET DEFAULT now()")


def downgrade() -> None:
    # 동결 디폴트로 되돌릴 이유 없음 — no-op
    pass
