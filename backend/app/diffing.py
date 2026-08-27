"""Run-to-run diffing: stable issue fingerprints, new/resolved/unchanged math,
score deltas, and content-change hashing.

An issue's identity across runs is its fingerprint:
    check_id + normalized page URL + selector path + normalized snippet hash
so the SAME defect on the same element matches between runs (→ unchanged), while
a defect that moves to a different selector reads as the old one resolved and a
new one appearing — which is the behavior we want to surface.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from app.crawl.normalize import normalize_url

_WS = re.compile(r"\s+")


def _norm_text(s: str | None) -> str:
    return _WS.sub(" ", (s or "").strip()).lower()


def snippet_hash(html_snippet: str | None) -> str:
    return hashlib.sha1(_norm_text(html_snippet).encode()).hexdigest()[:16]


def issue_fingerprint(rule_id: str, page_url: str, selector: str | None, html_snippet: str | None) -> str:
    """Stable identity for one issue instance across runs."""
    try:
        url = normalize_url(page_url)
    except Exception:
        url = page_url or ""
    parts = [rule_id or "", url, _norm_text(selector), snippet_hash(html_snippet)]
    return hashlib.sha256("|".join(parts).encode()).hexdigest()


def content_hash_text(text: str | None) -> str:
    """Hash of normalized main-content text — the change-detection key."""
    return hashlib.sha256(_norm_text(text).encode()).hexdigest()


@dataclass(frozen=True)
class DiffCounts:
    new: int
    resolved: int
    unchanged: int


def diff_fingerprint_sets(new_fps: set[str], prev_fps: set[str]) -> DiffCounts:
    """Compare two sets of issue fingerprints."""
    return DiffCounts(
        new=len(new_fps - prev_fps),
        resolved=len(prev_fps - new_fps),
        unchanged=len(new_fps & prev_fps),
    )


def score_deltas(new_scores: dict, prev_scores: dict) -> dict:
    """Per-key delta (new - prev) for any key present in either dict."""
    out: dict[str, int] = {}
    for key in set(new_scores) | set(prev_scores):
        a = prev_scores.get(key)
        b = new_scores.get(key)
        if a is None or b is None:
            continue
        out[key] = int(b) - int(a)
    return out
