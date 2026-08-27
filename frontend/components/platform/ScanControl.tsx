"use client";

import { useEffect, useRef, useState } from "react";

import { getScan } from "@/lib/api";
import { scanNow, type ActiveScan } from "@/lib/auth";

const ACTIVE = new Set(["pending", "crawling", "scoring"]);

/** Human label for "what's currently happening". */
function statusLabel(status: string, crawled: number, queued: number): string {
  switch (status) {
    case "pending":
      return "Queued…";
    case "crawling":
      return `Crawling — ${crawled} page${crawled === 1 ? "" : "s"}${queued ? ` · ${queued} queued` : ""}`;
    case "scoring":
      return "Scoring results…";
    default:
      return status;
  }
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Per-site "Scan" button. Triggers a scan, then shows what the run is doing and
 * how long it's been going, polling until it finishes. If a scan is already
 * running for the site (passed in via `activeScan`), it attaches to that one.
 */
export function ScanControl({
  siteId,
  activeScan,
  onComplete,
}: {
  siteId: string;
  activeScan: ActiveScan | null;
  onComplete: () => void;
}) {
  const [scan, setScan] = useState<ActiveScan | null>(activeScan);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  const running = scan != null && ACTIVE.has(scan.status);

  // Tick the elapsed clock once a second while a scan is running.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Poll the scan's status until it leaves an active state.
  const scanId = scan?.id;
  useEffect(() => {
    if (!running || !scanId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const s = await getScan(scanId);
        if (cancelled) return;
        if (ACTIVE.has(s.status)) {
          setScan({
            id: s.id,
            status: s.status,
            pages_crawled: s.pages_crawled,
            pages_queued: s.pages_queued,
            started_at: s.started_at ?? new Date().toISOString(),
          });
        } else {
          setScan(null);
          onComplete(); // done | failed → refresh the dashboard cards
        }
      } catch {
        /* transient error — keep polling */
      }
    };
    const t = setInterval(poll, 1500);
    poll();
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, scanId]);

  const startedRef = useRef<number>(Date.now());

  async function start(e: React.MouseEvent) {
    e.stopPropagation();
    setStarting(true);
    setErr(null);
    try {
      const { scan_id } = await scanNow(siteId);
      startedRef.current = Date.now();
      setNowTs(Date.now());
      setScan({
        id: scan_id,
        status: "pending",
        pages_crawled: 0,
        pages_queued: 0,
        started_at: new Date().toISOString(),
      });
    } catch {
      setErr("Couldn't start");
    } finally {
      setStarting(false);
    }
  }

  if (running && scan) {
    const elapsed = formatElapsed(nowTs - new Date(scan.started_at).getTime());
    return (
      <div
        className="flex items-center gap-2 text-xs"
        onClick={(e) => e.stopPropagation()}
        title="Scan in progress"
      >
        <span
          className="inline-block h-2.5 w-2.5 flex-none animate-pulse rounded-full"
          style={{ backgroundColor: "var(--brand)" }}
        />
        <span className="font-medium" style={{ color: "var(--text-strong)" }}>
          {statusLabel(scan.status, scan.pages_crawled, scan.pages_queued)}
        </span>
        <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
          · {elapsed}
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={start}
      disabled={starting}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-60"
      style={{ backgroundColor: "var(--brand)" }}
      title="Run a new scan of this site"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M21 12a9 9 0 1 1-3-6.7M21 4v4h-4" />
      </svg>
      {starting ? "Starting…" : err ?? "Scan"}
    </button>
  );
}
