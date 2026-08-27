"""Download and accessibility-check PDFs discovered during a crawl.

PDFs aren't rendered as pages — the crawl frontier collects their URLs and this
runs after the page crawl: fetch each PDF (size/timeout guarded), parse it, and
run the Group D checks. pdfplumber is blocking so parsing runs in an executor.
"""

from __future__ import annotations

import asyncio
import logging

import httpx

from app.audit.pdf_checks import parse_pdf, run_pdf_checks
from app.render.worker import DESKTOP_USER_AGENT

logger = logging.getLogger("wcag_scanner.pdf_worker")

_MAX_PDF_BYTES = 50 * 1024 * 1024   # 50 MB
_PDF_TIMEOUT_S = 30
_MAX_CONCURRENT = 3


async def _fetch_and_check(client: httpx.AsyncClient, url: str) -> tuple[str, list[dict], str | None]:
    try:
        async with client.stream("GET", url) as resp:
            if resp.status_code >= 400:
                return url, [], None, 0, 0
            cl = resp.headers.get("content-length")
            if cl and cl.isdigit() and int(cl) > _MAX_PDF_BYTES:
                logger.info("pdf too large, skipping %s (%s bytes)", url, cl)
                return url, [], None, 0, 0
            data = bytearray()
            async for chunk in resp.aiter_bytes():
                data += chunk
                if len(data) > _MAX_PDF_BYTES:
                    logger.info("pdf exceeded size cap mid-stream, skipping %s", url)
                    return url, [], None, 0, 0
    except Exception as exc:
        logger.info("pdf fetch failed %s: %s", url, exc)
        return url, [], None, 0, 0

    info = await asyncio.get_event_loop().run_in_executor(None, parse_pdf, bytes(data))
    return url, run_pdf_checks(info, url), info.title, info.word_count, info.sentence_count


async def process_pdfs(
    pdf_urls: list[str],
) -> list[tuple[str, list[dict], str | None, int, int]]:
    """Return (pdf_url, records, document_title) for each PDF that was parsed.

    The document title is the PDF's own metadata title, which is what a reader
    sees in their viewer; it is usually more meaningful than the filename.
    Documents with no findings are still returned so they can be inventoried.
    """
    if not pdf_urls:
        return []
    sem = asyncio.Semaphore(_MAX_CONCURRENT)
    async with httpx.AsyncClient(
        timeout=_PDF_TIMEOUT_S, follow_redirects=True,
        headers={"User-Agent": DESKTOP_USER_AGENT},
    ) as client:
        async def one(u: str) -> tuple[str, list[dict], str | None]:
            async with sem:
                return await _fetch_and_check(client, u)

        return list(await asyncio.gather(*(one(u) for u in pdf_urls)))
