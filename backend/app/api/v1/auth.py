from datetime import datetime, timedelta, timezone
from typing import Annotated

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.encryption import encrypt_value
from app.database import get_db
from app.dependencies import ALGORITHM, get_current_user, get_current_user_any_status
from app.models.user import User, UserStatus
from app.schemas.user import UserResponse

router = APIRouter()

# ---------------------------------------------------------------------------
# Google OAuth via Authlib
# ---------------------------------------------------------------------------
oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)
# Separate registration for calendar scope (used by /connect-gcal)
oauth.register(
    name="google_calendar",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile https://www.googleapis.com/auth/calendar"},
)

ACCESS_TOKEN_EXPIRE_MINUTES = settings.SESSION_MAX_AGE // 60  # match session lifetime


def _create_access_token(user: User) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/login")
async def login(request: Request):
    """Redirect to Google OAuth consent screen."""
    redirect_uri = settings.GOOGLE_REDIRECT_URI
    return await oauth.google.authorize_redirect(
        request,
        redirect_uri,
    )


@router.get("/callback")
async def callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Google OAuth callback, create/update user, return JWT."""
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"OAuth error: {exc}",
        )

    userinfo = token.get("userinfo")
    if userinfo is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not retrieve user info from Google",
        )

    google_sub: str = userinfo["sub"]
    email: str = userinfo["email"]
    name: str = userinfo.get("name", email.split("@")[0])
    picture: str | None = userinfo.get("picture")

    # Upsert user
    result = await db.execute(select(User).where(User.google_subject == google_sub))
    user = result.scalar_one_or_none()

    if user is None:
        # Also check by email for pre-registered users
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if user is None:
        user = User(
            email=email,
            name=name,
            google_subject=google_sub,
            profile_image_url=picture,
            status=UserStatus.pending,
        )
        db.add(user)
    else:
        user.google_subject = google_sub
        user.name = name
        if picture:
            user.profile_image_url = picture

    user.last_login_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(user)

    access_token = _create_access_token(user)

    # Redirect to frontend with token
    frontend_url = f"{settings.FRONTEND_URL}/auth/callback?token={access_token}"
    return RedirectResponse(url=frontend_url)


@router.get("/connect-gcal")
async def connect_gcal(request: Request):
    """Redirect to Google OAuth with calendar scope (explicit user opt-in)."""
    redirect_uri = settings.GOOGLE_REDIRECT_URI.replace("/callback", "/gcal-callback")
    return await oauth.google_calendar.authorize_redirect(
        request,
        redirect_uri,
        access_type="offline",
        prompt="consent",
    )


@router.get("/gcal-callback")
async def gcal_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Google Calendar OAuth callback — store refresh token."""
    try:
        token = await oauth.google_calendar.authorize_access_token(request)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"OAuth error: {exc}",
        )

    userinfo = token.get("userinfo")
    if userinfo is None:
        raise HTTPException(status_code=401, detail="Could not retrieve user info")

    google_sub: str = userinfo["sub"]
    result = await db.execute(select(User).where(User.google_subject == google_sub))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found. Please login first.")

    refresh_token = token.get("refresh_token")
    if refresh_token:
        user.google_refresh_token = encrypt_value(refresh_token)
        user.google_calendar_connected = True
        await db.commit()

    frontend_url = f"{settings.FRONTEND_URL}/profile?gcal=connected"
    return RedirectResponse(url=frontend_url)


@router.get("/me", response_model=UserResponse)
async def me(current_user: Annotated[User, Depends(get_current_user_any_status)]):
    """Return current authenticated user info."""
    return current_user


@router.post("/logout")
async def logout():
    """Logout — client should discard the JWT token.

    Since JWTs are stateless, server-side invalidation would require a
    blocklist (not implemented in Phase 1). The client is responsible for
    removing the stored token.
    """
    return {"message": "Logged out successfully. Please discard your token."}


@router.post("/dev-login")
async def dev_login(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """DEV ONLY: login by email without OAuth. Only works when DEBUG=True."""
    if not settings.DEBUG:
        raise HTTPException(status_code=403, detail="Only available in DEBUG mode")

    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="email required")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail=f"User with email {email} not found")

    # DEV 모드: pending/inactive 사용자도 자동 active (admin 승인 우회 — dev-login 자체가 dev 전용이니).
    # 운영에서는 DEBUG=False 라 이 엔드포인트 자체 차단됨.
    if user.status != UserStatus.active:
        user.status = UserStatus.active
        await db.commit()
        await db.refresh(user)

    access_token = _create_access_token(user)
    return {"access_token": access_token, "token_type": "bearer", "user": {"id": str(user.id), "email": user.email, "name": user.name, "role": user.role.value}}
