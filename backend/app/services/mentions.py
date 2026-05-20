"""@mention 파싱 + Notification 생성 — Phase 1A (2026-05-20).

지원 형식:
- @<email-username>  예: @jsdavid88        → User.email startswith "jsdavid88@"
- @<name>            예: @박지수            → User.name exact match
- @<full-email>      예: @jsdavid88@dsu.ac.kr → User.email exact match

매칭 우선순위: full-email → email-username → name. 중복 매치 시 첫 user.
"""
from __future__ import annotations

import re
import uuid
from typing import Iterable

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification, NotificationType, User

# 한글/영문/숫자/._@- 허용. 공백/구두점에서 끊김.
# @ 다음 첫 글자가 영숫자/한글 이면 매치.
MENTION_RE = re.compile(r"@([A-Za-z0-9가-힣._@-]+)")


def extract_mention_tokens(text: str) -> list[str]:
    """텍스트에서 @ 다음 토큰 추출 (중복 제거, 순서 유지)."""
    if not text:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for m in MENTION_RE.finditer(text):
        tok = m.group(1).rstrip(".,!?:;")  # 끝의 구두점 제거
        if tok and tok not in seen:
            seen.add(tok)
            out.append(tok)
    return out


async def resolve_mentions(db: AsyncSession, tokens: Iterable[str]) -> list[User]:
    """토큰들 → User 객체. exact match 만 (오작동 방지)."""
    tokens = list(tokens)
    if not tokens:
        return []

    # 한 query 로: name == token  OR  email == token  OR  email LIKE token||'@%'
    conditions = []
    for tok in tokens:
        conditions.append(User.name == tok)
        conditions.append(User.email == tok)
        conditions.append(User.email.ilike(f"{tok}@%"))

    res = await db.execute(select(User).where(or_(*conditions)))
    users = res.scalars().unique().all()
    return list(users)


async def create_mention_notifications(
    db: AsyncSession,
    text: str,
    actor: User,
    *,
    source_label: str,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
) -> int:
    """텍스트의 @mention 파싱 + Notification 생성.

    Args:
        text: 댓글/메시지 본문
        actor: 작성자 (자기 자신은 알림 X)
        source_label: 알림 본문에 표시될 출처 ("데일리 댓글", "SOTA 댓글" 등)
        target_type: 알림 클릭 시 점프 대상 type
        target_id: 점프 대상 id

    Returns: 생성된 알림 수
    """
    tokens = extract_mention_tokens(text)
    if not tokens:
        return 0

    users = await resolve_mentions(db, tokens)
    count = 0
    for u in users:
        if u.id == actor.id:
            continue  # 자기 자신 mention 알림 X

        # 같은 target 의 mention 중복 알림 방지 — 같은 user 한 번만
        snippet = (text or "").strip().replace("\n", " ")[:120]
        title = f"{actor.name}님이 {source_label}에서 당신을 언급했어요"

        db.add(Notification(
            user_id=u.id,
            notification_type=NotificationType.daily_comment,  # 별도 type 없음 — daily_comment 재사용
            title=title,
            body=snippet,
            target_type=target_type,
            target_id=target_id,
        ))
        count += 1
    return count
