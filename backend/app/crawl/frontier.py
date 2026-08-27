"""The frontier: the shared work queue multiple render workers consume from.

One frontier per crawl. It owns the ``seen`` set (keyed on normalized URL) and
enforces every enqueue rule in one place so a worker can just call
``add(url, depth)`` with a freshly discovered link and trust that dedupe,
same-site, robots, ignore-patterns, renderability and the page budget are all
applied. Designed for concurrent consumers: all shared state is guarded by an
asyncio lock.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from app.crawl.ignore import IgnoreMatcher
from app.crawl.normalize import document_extension, is_in_scope, is_renderable, is_same_site, normalize_url
from app.crawl.robots_sitemap import RobotsTxt





@dataclass(frozen=True)
class FrontierItem:
    url: str          # normalized
    depth: int


class Frontier:
    def __init__(
        self,
        root_url: str,
        *,
        robots: RobotsTxt,
        ignore: IgnoreMatcher,
        max_pages: int,
        max_depth: int,
        max_documents: int = 300,
        user_agent: str = "*",
        respect_robots: bool = True,
    ):
        self.root_url = normalize_url(root_url)
        self._robots = robots
        self._ignore = ignore
        self._max_pages = max_pages
        self._max_depth = max_depth
        self._max_documents = max_documents
        self._user_agent = user_agent
        self._respect_robots = respect_robots

        self._queue: asyncio.Queue[FrontierItem] = asyncio.Queue()
        self._seen: set[str] = set()
        self._lock = asyncio.Lock()
        # Documents linked from the site (PDF, Office, OpenDocument). Collected but
        # never queued for render; PDFs are accessibility-checked after the crawl and
        # the rest are inventoried. A document counts against its own budget, so a
        # page-heavy site still reports the files it links to.
        self.document_urls: set[str] = set()
        # How many pages we've committed to rendering (admitted to the queue and
        # counted against the budget). Distinct from how many have finished.
        self._admitted = 0

    @property
    def seen_count(self) -> int:
        return len(self._seen)

    def qsize(self) -> int:
        return self._queue.qsize()

    async def seed(self, urls: list[str]) -> int:
        """Enqueue the start URL and any sitemap URLs at depth 0. Returns count added."""
        added = 0
        for url in urls:
            if await self.add(url, 0):
                added += 1
        return added

    async def add(self, url: str, depth: int, *, base: str | None = None) -> bool:
        """Normalize, apply every admission rule, enqueue if new. Returns True if enqueued."""
        if depth > self._max_depth:
            return False
        try:
            norm = normalize_url(url, base=base)
        except ValueError:
            return False

        # Documents the site links to, anywhere on its own domain: collect the URL
        # (bounded by its own budget) and never queue it for rendering.
        if document_extension(norm) and is_same_site(norm, self.root_url):
            async with self._lock:
                if len(self.document_urls) < self._max_documents:
                    self.document_urls.add(norm)
            return False

        if not is_renderable(norm):
            return False
        if not is_in_scope(norm, self.root_url):
            return False
        if self._ignore.matches(norm):
            return False
        if self._respect_robots and not self._robots.can_fetch(norm, self._user_agent):
            return False

        async with self._lock:
            if norm in self._seen:
                return False
            if self._admitted >= self._max_pages:
                return False
            self._seen.add(norm)
            self._admitted += 1
            await self._queue.put(FrontierItem(url=norm, depth=depth))
            return True

    async def get(self) -> FrontierItem:
        return await self._queue.get()

    def task_done(self) -> None:
        self._queue.task_done()

    async def join(self) -> None:
        await self._queue.join()

    def budget_reached(self) -> bool:
        return self._admitted >= self._max_pages
