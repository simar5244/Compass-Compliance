"""URL-safe public report slugs (nanoid-style), generated with the stdlib.

No external dependency: `secrets.choice` over a URL-safe, unambiguous alphabet.
21 chars of this 60-symbol alphabet is ~124 bits — collision-safe for the
volumes an instant-scan demo will ever see, and short enough to share.
"""

from __future__ import annotations

import secrets

# Omit look-alikes (0/O, 1/l/I) so a slug read aloud or copied stays unambiguous.
_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"


def new_slug(length: int = 21) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))
