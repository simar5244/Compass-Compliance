"""Per-domain politeness gate.

Spaces the *start* of navigations to a given domain by at least `delay` seconds,
while still letting multiple workers render concurrently (rendering, the slow
part, overlaps; only the request kickoff is serialized per domain). This honors
"1 request/second/domain" without collapsing the whole crawl to one worker.
"""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict, deque
from urllib.parse import urlparse


class DomainRateLimiter:
    def __init__(self, delay_seconds: float):
        self._delay = delay_seconds
        self._next_allowed: dict[str, float] = defaultdict(float)
        self._locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    async def acquire(self, url: str) -> None:
        if self._delay <= 0:
            return
        domain = urlparse(url).netloc.lower()
        async with self._locks[domain]:
            now = time.monotonic()
            wait = self._next_allowed[domain] - now
            if wait > 0:
                await asyncio.sleep(wait)
            self._next_allowed[domain] = time.monotonic() + self._delay


class InstantRateLimiter:
    """Per-IP sliding-window limiter for the public instant-scan create path.

    In-memory (fine for a single API process / demo). For a multi-process
    deployment, back this with Redis — the interface stays the same.
    """

    def __init__(self, max_requests: int, window_seconds: float):
        self._max = max_requests
        self._window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        """Record a hit for ``key`` (e.g. client IP); return False if over limit."""
        now = time.monotonic()
        hits = self._hits[key]
        while hits and hits[0] <= now - self._window:
            hits.popleft()
        if len(hits) >= self._max:
            return False
        hits.append(now)
        return True

    def retry_after(self, key: str) -> int:
        """Seconds until the oldest hit for ``key`` falls out of the window."""
        hits = self._hits.get(key)
        if not hits:
            return 0
        return max(0, int(self._window - (time.monotonic() - hits[0])) + 1)


class UserRateLimiter(InstantRateLimiter):
    """Small in-memory sliding-window limiter keyed by authenticated user."""
