"""Password hashing and opaque session tokens.

Passwords are bcrypt-hashed (passlib). Sessions are server-side: a random opaque
token is stored (hashed) in the `sessions` table and handed to the client in an
httpOnly cookie, so logout is a real server-side revocation and tokens never
appear in logs in a reversible form.
"""

from __future__ import annotations

import hashlib
import os
import secrets

from passlib.context import CryptContext

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

SESSION_COOKIE = "wct_session"
SESSION_TTL_DAYS = 14

#: Path scope for the session cookie. Behind a reverse proxy that mounts the app
#: on a sub-path this should match that prefix (e.g. "/compass") so the cookie
#: is not offered to unrelated apps sharing the domain. Defaults to "/" for local
#: development, where the app is served from the root.
SESSION_COOKIE_PATH = os.getenv("SESSION_COOKIE_PATH", "/")

#: Send the session cookie only over HTTPS. Off by default so local development
#: over plain http://localhost still authenticates; set to 1 in any deployment
#: served over TLS, otherwise the session token can travel in cleartext.
SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "0").lower() in {"1", "true", "yes"}


def hash_password(password: str) -> str:
    return _pwd.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _pwd.verify(password, password_hash)
    except Exception:
        return False


def new_session_token() -> str:
    """A high-entropy opaque token given to the client (in the cookie)."""
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    """What we actually store — so a DB leak doesn't expose live session tokens."""
    return hashlib.sha256(token.encode()).hexdigest()
