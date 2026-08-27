"""Non-DOM signals collected while a page renders.

The render worker captures response headers, cookies, console output, the network
request list, and timing once per page and hands them to the header / DOM /
lighthouse check modules as a single ``ResponseContext``. Keeping this separate
from the live Playwright ``Page`` means checks operate on plain data and are
trivially unit-testable with a hand-built context.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import tldextract

# tldextract keeps a cached public-suffix list on disk; suppress live fetches so
# a render never blocks on the network to classify a domain.
_EXTRACT = tldextract.TLDExtract(suffix_list_urls=())


def registered_domain(url: str) -> str:
    """eTLD+1 for ``url`` (e.g. https://a.b.example.co.uk/x -> example.co.uk)."""
    try:
        ext = _EXTRACT(url)
        return ".".join(p for p in (ext.domain, ext.suffix) if p)
    except Exception:
        return ""


@dataclass
class ConsoleMessage:
    level: str          # "error" | "warning" | "info" | "log" | "debug"
    text: str
    url: str = ""       # source location url
    line: int = 0


@dataclass
class NetworkRequest:
    url: str
    domain: str                 # registered domain of the request url
    resource_type: str          # document|script|stylesheet|image|font|xhr|fetch|...
    method: str = "GET"
    status: int | None = None
    is_external: bool = False    # different registered domain than the page


@dataclass
class Cookie:
    name: str
    domain: str = ""
    path: str = "/"
    secure: bool = False
    http_only: bool = False
    same_site: str | None = None


@dataclass
class ResponseContext:
    """Everything the non-DOM checks (Groups A/B/C) need from render time."""

    url: str = ""
    final_url: str = ""
    status_code: int | None = None
    is_https: bool = False
    headers: dict[str, str] = field(default_factory=dict)   # keys lowercased
    cookies: list[Cookie] = field(default_factory=list)
    console_messages: list[ConsoleMessage] = field(default_factory=list)
    page_errors: list[str] = field(default_factory=list)
    requests: list[NetworkRequest] = field(default_factory=list)
    ttfb_ms: int | None = None

    def header(self, name: str) -> str | None:
        """Case-insensitive header lookup; None if absent."""
        return self.headers.get(name.lower())

    def has_header(self, name: str) -> bool:
        return name.lower() in self.headers

    @property
    def console_errors(self) -> list[ConsoleMessage]:
        return [m for m in self.console_messages if m.level == "error"]

    @property
    def external_requests(self) -> list[NetworkRequest]:
        return [r for r in self.requests if r.is_external]

    def insecure_cookies(self) -> list[Cookie]:
        """Cookies missing the Secure flag (only meaningful on HTTPS pages)."""
        return [c for c in self.cookies if not c.secure]
