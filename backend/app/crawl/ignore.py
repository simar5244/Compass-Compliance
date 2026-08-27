"""Compiled URL ignore-pattern matcher for escaping spider traps.

Spider traps are URL spaces that are effectively infinite — calendars with a
"next month" link forever, faceted-search permutations, session-id query
strings. A crawl that wanders into one never terminates within max_pages on
anything useful. Callers pass regexes (from scan config / site defaults); any
URL matching one is never enqueued.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

# Sensible defaults that catch the most common infinite spaces. Per-scan
# patterns are added on top of these, never replacing them.
DEFAULT_IGNORE_PATTERNS: tuple[str, ...] = (
    r"/cal(endar)?/\d{4}/\d{1,2}",     # /calendar/2026/07 style infinite calendars
    r"[?&](date|month|year|day)=",      # date-driven query navigation
    r"[?&](jsessionid|phpsessid|sid)=", # session ids that multiply URLs
    r"[?&]replytocom=",                 # WordPress comment-reply permutations
    r"/(page|p)/\d{3,}",                # pagination past page 999 (runaway)
)


class IgnoreMatcher:
    def __init__(self, patterns: Iterable[str]):
        self._regexes: list[re.Pattern[str]] = []
        for p in patterns:
            try:
                self._regexes.append(re.compile(p, re.IGNORECASE))
            except re.error:
                # A bad user-supplied regex shouldn't take down the crawl.
                continue

    @classmethod
    def with_defaults(cls, extra: Iterable[str] | None = None) -> "IgnoreMatcher":
        return cls(list(DEFAULT_IGNORE_PATTERNS) + list(extra or []))

    def matches(self, url: str) -> bool:
        return any(rx.search(url) for rx in self._regexes)
