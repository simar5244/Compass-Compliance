# syntax=docker/dockerfile:1
#
# The scanner needs an unusually heavy runtime: a real Chromium for rendering,
# a JRE for LanguageTool (grammar), and Node for Lighthouse (web vitals). Two of
# those fail *silently* when absent — grammar checks and web vitals just stop
# producing results while scans still report success — so all three are baked in
# here rather than left to the host.

FROM python:3.13-slim-bookworm AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    # Keep Playwright's browsers and LanguageTool's distribution at fixed paths
    # owned by the image, not in a home directory that changes with the user.
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright \
    LTP_PATH=/opt/languagetool

WORKDIR /app

# --- system packages -------------------------------------------------------
# openjdk-17-jre-headless: LanguageTool. ensure_java() checks PATH first, so a
#   JRE >= 17 here satisfies it (its Homebrew fallbacks are macOS-only).
# nodejs/npm: Lighthouse CLI used by the web-vitals capture.
RUN apt-get update && apt-get install -y --no-install-recommends \
        openjdk-17-jre-headless \
        nodejs \
        npm \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

# --- python deps -----------------------------------------------------------
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# --- chromium + its system libraries ---------------------------------------
# --with-deps pulls the apt packages Chromium needs; doing this via Playwright
# keeps the browser build and its libs in lockstep with the pinned version.
RUN playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# --- lighthouse ------------------------------------------------------------
COPY node/package.json node/package-lock.json ./node/
RUN cd node && npm ci --omit=dev

# --- languagetool ----------------------------------------------------------
# Pre-download (~400MB) at build time. Left to runtime this would fetch on the
# first scan, adding a large download to a page's time budget and requiring
# outbound network from production.
RUN python -c "import language_tool_python; language_tool_python.LanguageTool('en-US').close()"

# --- lighthouse's browser ---------------------------------------------------
# Lighthouse shells out through chrome-launcher, which does NOT know about
# Playwright's browsers and searches standard system locations instead. Without
# CHROME_PATH it finds nothing and fails with its stderr discarded, so web
# vitals silently produce no data while scans still report success. Symlink to a
# stable path rather than hardcoding the version-stamped directory.
RUN CHROME_BIN="$(find /opt/playwright -type f -name chrome -path '*chrome-linux*' | head -1)" \
    && test -n "$CHROME_BIN" || (echo "chromium binary not found under /opt/playwright" >&2; exit 1) \
    && ln -sf "$CHROME_BIN" /usr/local/bin/chrome
ENV CHROME_PATH=/usr/local/bin/chrome

# --- application ------------------------------------------------------------
COPY . .

# Scan artifacts (screenshots + serialized DOM) grow without bound; mount a
# volume here so they do not fill the container's writable layer.
ENV ARTIFACT_DIR=/data/artifacts
RUN mkdir -p /data/artifacts

# Chromium cannot run as root without --no-sandbox; run as a normal user and
# give it ownership of the writable paths.
RUN useradd --create-home --uid 1001 scanner \
    && chown -R scanner:scanner /data /opt/languagetool
USER scanner

EXPOSE 8001

# Default is the API. The worker runs from the same image with a different
# command (see docker-compose.yml) — it is a separate process, not a thread.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
