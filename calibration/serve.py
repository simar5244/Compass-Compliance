"""Serve the calibration fixture site.

CLI:      python -m calibration.serve [port]      (default 8099)
As lib:   with serve_fixtures() as base_url: ...  (ephemeral port, background thread)

Deliberately sends NO Strict-Transport-Security header, so the `hsts` privacy
check fires on every fixture page (see manifest privacy.html expectation).
"""

from __future__ import annotations

import contextlib
import functools
import http.server
import socketserver
import threading
from pathlib import Path

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


class _Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # quiet
        pass


def _make_handler():
    return functools.partial(_Handler, directory=str(FIXTURES_DIR))


@contextlib.contextmanager
def serve_fixtures(port: int = 0):
    """Serve fixtures on a background thread; yields the base URL. Picks a free
    port when ``port`` is 0."""
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), _make_handler())
    actual_port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{actual_port}"
    finally:
        httpd.shutdown()
        httpd.server_close()


def main() -> None:
    import sys

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), _make_handler())
    print(f"Serving calibration fixtures at http://127.0.0.1:{port}  (Ctrl-C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()


if __name__ == "__main__":
    main()
