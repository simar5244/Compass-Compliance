"""The frontier collects linked documents on its own budget, and never queues them.

Documents are detected by the linked file's extension, so a page-heavy site still
reports the files it links to rather than exhausting the page budget first.
"""

import urllib.robotparser

import pytest

from app.crawl.frontier import Frontier
from app.crawl.ignore import IgnoreMatcher
from app.crawl.robots_sitemap import RobotsTxt

ROOT = "https://www.depts.ttu.edu/k12/"


def _frontier(**kwargs) -> Frontier:
    parser = urllib.robotparser.RobotFileParser()
    parser.parse([])
    options = {"max_pages": 50, "max_depth": 3, "respect_robots": False}
    options.update(kwargs)
    return Frontier(ROOT, robots=RobotsTxt(parser, []), ignore=IgnoreMatcher([]), **options)


@pytest.mark.asyncio
async def test_documents_are_collected_not_queued():
    f = _frontier()
    for url in (
        "https://www.depts.ttu.edu/k12/forms/enrol.pdf",
        "https://www.depts.ttu.edu/k12/forms/plan.docx",
        "https://www.depts.ttu.edu/k12/data/grades.xlsx",
        "https://www.depts.ttu.edu/k12/deck.pptx",
    ):
        assert await f.add(url, 1) is False, "documents are never rendered"
    assert len(f.document_urls) == 4
    assert f.seen_count == 0


@pytest.mark.asyncio
async def test_documents_elsewhere_on_the_domain_still_count():
    """A K-12 page linking to a handbook on another ttu.edu host is still its document."""
    f = _frontier()
    await f.add("https://www.depts.ttu.edu/dos/handbook.pdf", 1)
    assert "https://www.depts.ttu.edu/dos/handbook.pdf" in f.document_urls


@pytest.mark.asyncio
async def test_third_party_documents_are_ignored():
    f = _frontier()
    await f.add("https://cdn.example.com/brochure.pdf", 1)
    assert f.document_urls == set()


@pytest.mark.asyncio
async def test_document_budget_is_independent_of_the_page_budget():
    f = _frontier(max_pages=1, max_documents=3)
    await f.add("https://www.depts.ttu.edu/k12/a", 1)  # consumes the page budget
    for i in range(10):
        await f.add(f"https://www.depts.ttu.edu/k12/doc{i}.pdf", 1)
    assert len(f.document_urls) == 3, "documents stop at their own cap, not the page cap"


@pytest.mark.asyncio
async def test_out_of_scope_pages_are_not_queued():
    f = _frontier()
    assert await f.add("https://www.ttu.edu/", 1) is False
    assert await f.add("https://www.depts.ttu.edu/biology/", 1) is False
    assert await f.add("https://www.depts.ttu.edu/k12/about", 1) is True
