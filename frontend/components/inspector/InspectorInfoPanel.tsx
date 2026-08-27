"use client";

import type { PageDetail } from "@/lib/api";
import { InspectorScoreRing } from "./InspectorScoreRing";

const HTTP_STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  410: "Gone",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

export function truncateUrl(url: string, maxLength = 50) {
  return url.length > maxLength ? `${url.slice(0, maxLength - 1)}…` : url;
}

export function relativeScanTime(value: string | null, now = Date.now()) {
  if (!value) return "—";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "—";
  const elapsed = Math.max(0, now - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function httpStatus(status: number | null) {
  if (status == null) return "—";
  const text = HTTP_STATUS_TEXT[status];
  return text ? `${status} ${text}` : String(status);
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-[#737373]">{label}</dt>
      <dd className="mt-1 text-xs leading-5 text-black">{children}</dd>
    </div>
  );
}

export function InspectorInfoPanel({ page }: { page: PageDetail }) {
  return (
    <section className="px-4 py-5" aria-labelledby="page-information-heading">
      <h2
        id="page-information-heading"
        className="mb-5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#737373]"
      >
        Page information
      </h2>

      <dl className="space-y-5">
        <InfoField label="URL">
          <a
            href={page.url}
            target="_blank"
            rel="noreferrer"
            title={page.url}
            className="block break-all text-black underline"
          >
            {truncateUrl(page.url)}
          </a>
        </InfoField>
        <InfoField label="Page title">{page.title?.trim() || "—"}</InfoField>
        <InfoField label="Page score">
          <InspectorScoreRing score={page.score} size={40} stroke={3} />
        </InfoField>
        <InfoField label="Word count">
          {page.word_count == null ? "—" : `${page.word_count.toLocaleString("en-US")} words`}
        </InfoField>
        <InfoField label="Reading age">
          {page.reading_age == null ? "—" : page.reading_age.toFixed(1)}
        </InfoField>
        <InfoField label="Last scanned">{relativeScanTime(page.last_scanned_at)}</InfoField>
        <InfoField label="Render time">
          {page.render_time_ms == null ? "—" : `${page.render_time_ms.toLocaleString("en-US")} ms`}
        </InfoField>
        <InfoField label="HTTP status">{httpStatus(page.http_status)}</InfoField>
        <InfoField label="Issues found">
          <span className="whitespace-nowrap">
            {page.issue_count_automated.toLocaleString("en-US")} automated ·{" "}
            {page.issue_count_manual.toLocaleString("en-US")} manual review
          </span>
        </InfoField>
        <InfoField label="Is document">{page.is_document ? "Yes (Document)" : "No (Web page)"}</InfoField>
      </dl>
    </section>
  );
}
