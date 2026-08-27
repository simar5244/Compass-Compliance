"""Artifact storage: screenshots and serialized DOM go to the filesystem; the DB
only holds a reference string.

Layout under the configured root:
    <root>/<scan_id>/<page_id>/desktop.png
                              /mobile.png
                              /dom.html
The returned ref is the path relative to the root, so the store can later be
swapped for object storage (S3/GCS) by changing only this module and how refs
are resolved — nothing in the DB changes.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from app.config import settings


def _root() -> Path:
    root = Path(settings.artifact_dir).expanduser()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


async def save_page_artifacts(
    scan_id: str,
    page_id: str,
    *,
    desktop_png: bytes = b"",
    mobile_png: bytes = b"",
    narrow_png: bytes = b"",
    serialized_dom: str = "",
) -> dict[str, str | None]:
    """Persist a page's artifacts off the event loop. Returns {kind: relative_ref}."""
    root = _root()
    rel_dir = Path(scan_id) / page_id
    refs: dict[str, str | None] = {
        "desktop_screenshot": None, "mobile_screenshot": None,
        "narrow_screenshot": None, "dom": None,
    }

    def _do() -> None:
        if desktop_png:
            _write_bytes(root / rel_dir / "desktop.png", desktop_png)
            refs["desktop_screenshot"] = str(rel_dir / "desktop.png")
        if mobile_png:
            _write_bytes(root / rel_dir / "mobile.png", mobile_png)
            refs["mobile_screenshot"] = str(rel_dir / "mobile.png")
        if narrow_png:
            _write_bytes(root / rel_dir / "narrow.png", narrow_png)
            refs["narrow_screenshot"] = str(rel_dir / "narrow.png")
        if serialized_dom:
            _write_text(root / rel_dir / "dom.html", serialized_dom)
            refs["dom"] = str(rel_dir / "dom.html")

    await asyncio.to_thread(_do)
    return refs


def resolve_ref(ref: str) -> Path:
    """Absolute path for a stored ref (used by the API when serving artifacts)."""
    return _root() / ref
