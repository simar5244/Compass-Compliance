"""URL normalization and same-site checks.

Normalization is the single source of truth for the frontier's ``seen`` set: two
URLs that point at the same resource must normalize to the same string, or we
crawl (and audit) the same page twice.

Normalization steps:
  * strip #fragments
  * lowercase the scheme and host
  * resolve relative URLs against the page they were found on
  * drop tracking-only query params (utm_*, gclid, fbclid, ...)
  * sort the remaining query params so ?a=1&b=2 == ?b=2&a=1
  * normalize a trailing slash (keep "/" for the root, drop it elsewhere)
"""

from __future__ import annotations

from urllib.parse import (
    parse_qsl,
    urldefrag,
    urlencode,
    urljoin,
    urlparse,
    urlunparse,
)

import tldextract

# Query params that never change which resource is served; only used for
# analytics / ad attribution. Matched case-insensitively.
_TRACKING_PARAMS_EXACT = {
    "gclid",
    "fbclid",
    "dclid",
    "gclsrc",
    "gbraid",
    "wbraid",
    "msclkid",
    "mc_cid",
    "mc_eid",
    "igshid",
    "yclid",
    "_hsenc",
    "_hsmi",
    "vero_id",
    "oly_anon_id",
    "oly_enc_id",
}
_TRACKING_PARAMS_PREFIX = ("utm_",)

SKIP_SCHEMES = {"mailto", "tel", "javascript", "data", "blob", "file", "ftp"}

# Downloadable documents are recognised by the linked file's extension, the same
# way Silktide detects them. PDFs additionally get accessibility-checked; the
# other formats are inventoried only.
DOCUMENT_EXTENSIONS = (
    ".pdf",
    ".doc", ".docx", ".rtf", ".odt",
    ".xls", ".xlsx", ".ods", ".csv",
    ".ppt", ".pptx", ".odp",
)

# Binary / non-HTML resources we never want to render.
SKIP_EXTENSIONS = {
    ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico", ".avif",
    ".zip", ".rar", ".7z", ".gz", ".tar", ".dmg", ".exe", ".pkg",
    ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv",
    ".mp3", ".mp4", ".avi", ".mov", ".wav", ".webm", ".ogg", ".m4a",
    ".css", ".js", ".mjs", ".json", ".rss", ".atom",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
}

# Reuse one extractor with no live suffix-list fetches (offline, deterministic).
_extract = tldextract.TLDExtract(suffix_list_urls=())


def _is_tracking_param(key: str) -> bool:
    k = key.lower()
    if k in _TRACKING_PARAMS_EXACT:
        return True
    return any(k.startswith(p) for p in _TRACKING_PARAMS_PREFIX)


def normalize_url(url: str, base: str | None = None) -> str:
    """Return the canonical form of ``url``, optionally resolved against ``base``.

    ``base`` is the URL of the page the link was found on, so relative hrefs
    ("/about", "../x") resolve correctly.
    """
    if base:
        url = urljoin(base, url)
    url, _frag = urldefrag(url)
    parsed = urlparse(url)

    scheme = parsed.scheme.lower()
    netloc = parsed.netloc.lower()

    # Drop a default port so http://x:80 == http://x.
    if netloc.endswith(":80") and scheme == "http":
        netloc = netloc[:-3]
    elif netloc.endswith(":443") and scheme == "https":
        netloc = netloc[:-4]

    path = parsed.path or "/"
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/")

    kept = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if not _is_tracking_param(k)]
    kept.sort()
    query = urlencode(kept)

    return urlunparse((scheme, netloc, path, parsed.params, query, ""))


def registrable_domain(url_or_host: str) -> str:
    """The registrable domain (eTLD+1), e.g. 'depts.ttu.edu' -> 'ttu.edu'.

    Used for same-site checks so 'www.ttu.edu' and 'depts.ttu.edu' count as one
    site but 'ttu.edu' and 'example.com' don't.
    """
    host = url_or_host
    if "//" in host or "/" in host:
        host = urlparse(host if "//" in host else f"//{host}").netloc
    host = host.split("@")[-1].split(":")[0]
    ext = _extract(host)
    if not ext.domain:
        return host.lower()
    if ext.suffix:
        return f"{ext.domain}.{ext.suffix}".lower()
    return ext.domain.lower()


def is_same_site(url: str, root_url: str) -> bool:
    return registrable_domain(url) == registrable_domain(root_url)


def _host_key(host: str) -> str:
    """Host without credentials, port, or a leading 'www.' so the two forms match."""
    h = host.lower().split("@")[-1].split(":")[0]
    return h[4:] if h.startswith("www.") else h


def is_in_scope(url: str, root_url: str) -> bool:
    """True when ``url`` belongs to the crawled site: same host, at or below its path.

    Scoping on the registrable domain alone treats every sibling host as one site,
    so a crawl rooted at https://www.depts.ttu.edu/k12/ wanders into www.ttu.edu,
    eraider.ttu.edu and the rest of the university. A site is its host *and* the
    path it is rooted at; a root path of "/" means the whole host is in scope.
    """
    try:
        parsed = urlparse(normalize_url(url))
        root = urlparse(normalize_url(root_url))
    except ValueError:
        return False

    if _host_key(parsed.netloc) != _host_key(root.netloc):
        return False

    prefix = root.path or "/"
    if prefix == "/":
        return True
    path = parsed.path or "/"
    return path == prefix or path.startswith(f"{prefix}/")


def document_extension(url: str) -> str | None:
    """The document extension this URL points at, or None if it is not a document."""
    path = url.split("?", 1)[0].split("#", 1)[0].lower()
    for ext in DOCUMENT_EXTENSIONS:
        if path.endswith(ext):
            return ext
    return None


def is_renderable(url: str) -> bool:
    """False for schemes/extensions we should never hand to a browser."""
    parsed = urlparse(url)
    if parsed.scheme and parsed.scheme.lower() not in {"http", "https"}:
        return False
    if parsed.scheme.lower() in SKIP_SCHEMES:
        return False
    path_lower = parsed.path.lower()
    return not any(path_lower.endswith(ext) for ext in SKIP_EXTENSIONS)
