"""Auth adapter — placeholder for glocal30Hub OAuth integration.

Phase 6: Standalone mode returns an anonymous user.
Future: when mounted under Hub, this module will verify the Hub-issued JWT
and populate user_id/user_name from the token.

The rest of the app depends on get_current_user() so that swapping auth is
a one-file change when Hub integration happens.
"""
from dataclasses import dataclass

from fastapi import Header


@dataclass
class CurrentUser:
    user_id: str
    user_name: str
    is_anonymous: bool = False


ANONYMOUS = CurrentUser(user_id="anon", user_name="익명", is_anonymous=True)


async def get_current_user(
    x_user_id: str | None = Header(default=None),
    x_user_name: str | None = Header(default=None),
) -> CurrentUser:
    """Return the current user.

    Standalone mode: accepts optional X-User-Id / X-User-Name headers for
    basic identification (no verification). This is a stopgap until Hub
    mounts this module and replaces the dependency with real JWT validation.
    """
    if x_user_id:
        return CurrentUser(
            user_id=x_user_id,
            user_name=x_user_name or x_user_id,
            is_anonymous=False,
        )
    return ANONYMOUS
