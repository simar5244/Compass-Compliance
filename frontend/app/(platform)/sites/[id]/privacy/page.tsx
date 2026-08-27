"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowUpRight, ChevronLeft, ChevronRight, FileText, Mail, Phone, Users } from "lucide-react";

import { getPrivacyOverview, type PrivacyOverview } from "@/lib/auth";
import { bandLabel } from "@/components/platform/ui";
import {
  MultiLineChart,
  ScoreSparkline,
} from "@/components/platform/site/overview/OverviewPrimitives";

/** Matches the order the scores-over-time chart uses; Compass grayscale only. */
const GROUPS = [
  { key: "consent" as const, label: "Consent", color: "#111111" },
  { key: "audit" as const, label: "Audit", color: "#525252" },
  { key: "security" as const, label: "Security", color: "#a3a3a3" },
];

const PAGE_SIZE = 10;

const SURFACES = [
  {
    href: "phone-numbers",
    label: "Phone numbers",
    desc: "Public numbers that may be personal data",
    Icon: Phone,
  },
  {
    href: "emails",
    label: "Emails",
    desc: "Addresses published on the site",
    Icon: Mail,
  },
  {
    href: "forms",
    label: "Forms",
    desc: "Fields that can collect personal information",
    Icon: FileText,
  },
] as const;

function deltaCopy(delta: number | null, score: number | null) {
  if (delta != null && delta !== 0) {
    return `${delta > 0 ? "↑ Up" : "↓ Down"} ${Math.abs(delta).toFixed(2)}%`;
  }
  if (delta === 0) return "No change since the last run";
  if (score != null) return "No previous run to compare";
  return null;
}

function formatRun(at: string) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function scoreCell(value: number | null) {
  return value == null ? "—" : Math.round(value);
}

export default function PrivacyOverviewPage() {
  const params = useParams<{ id: string }>();
  const requestKey = params.id;
  const [loaded, setLoaded] = useState<{
    key: string;
    data: PrivacyOverview | null;
    error: string | null;
  }>({ key: "", data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    getPrivacyOverview(params.id)
      .then((r) => { if (!cancelled) setLoaded({ key: requestKey, data: r, error: null }); })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey, data: null,
            error: e instanceof Error ? e.message : "Failed to load the privacy overview",
          });
        }
      });
    return () => { cancelled = true; };
  }, [params.id, requestKey]);

  const fresh = loaded.key === requestKey ? loaded : null;
  const data = fresh?.data ?? null;
  const error = fresh?.error ?? null;

  if (error) {
    return (
      <div className="light-theme bg-white px-8 py-10 text-sm text-[#737373]">
        {error.includes("404") ? "No completed scan yet." : error}
      </div>
    );
  }
  if (!data) return <CompassLoader fullPage label="Loading privacy overview…" />;

  const scorePoints = data.history
    .filter((point): point is typeof point & { score: number } => point.score != null)
    .map((point) => ({ at: point.at, value: point.score }));

  return (
    <div className="light-theme bg-white text-black">
      <section className="px-6 py-10 lg:px-12 lg:py-14">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">GDPR</p>
        <h1 className="mt-3 max-w-[14ch] text-[48px] font-semibold leading-[0.92] tracking-[-0.05em] lg:text-[72px]">
          Privacy
        </h1>
        <p className="mt-6 max-w-xl text-sm leading-6 text-[#525252]">
          How compliant this website is with GDPR requirements.
        </p>
        <p className="mt-4 flex items-center gap-2 text-sm text-[#737373]">
          <Users aria-hidden className="h-4 w-4" /> For people improving privacy
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 px-6 pb-8 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_1fr] lg:px-12">
        <div className="flex min-h-[220px] flex-col justify-between rounded-[3px] bg-black p-6 text-white lg:min-h-[240px] lg:p-7">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">{bandLabel(data.score)}</p>
            <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.05em] lg:text-[48px]">
              {data.score == null ? "—" : Math.round(data.score)}
            </p>
          </div>
          <div>
            <p className="text-lg font-semibold lg:text-xl">Overall score</p>
            <p className="mt-1 max-w-sm text-sm text-white/60">Latest completed scan</p>
          </div>
        </div>

        {GROUPS.map((group) => {
          const value = data.groups[group.key];
          const copy = deltaCopy(value.delta, value.score);
          return (
            <div
              key={group.key}
              className="flex min-h-[220px] flex-col justify-between rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-6 lg:min-h-[240px]"
            >
              <div>
                <p className="text-[32px] font-semibold leading-none tracking-[-0.05em] lg:text-[36px]">
                  {value.score == null ? "—" : Math.round(value.score)}
                </p>
                <div
                  className="mt-4 h-1 w-full bg-[#e5e5e5]"
                  role="img"
                  aria-label={`${group.label} ${value.score ?? "not scored"}%`}
                >
                  <div
                    className="h-full bg-black"
                    style={{ width: `${Math.max(0, Math.min(100, value.score ?? 0))}%` }}
                  />
                </div>
              </div>
              <div>
                {copy && (
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#737373]">{copy}</p>
                )}
                <p className="mt-2 text-lg font-semibold">{group.label}</p>
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-3 px-6 pb-8 lg:grid-cols-2 lg:px-12">
        <div className="rounded-[3px] border border-[#e5e5e5] bg-white p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Trend</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">Score over time</h2>
          <div className="mt-4">
            <ScoreSparkline points={scorePoints} />
          </div>
        </div>
        <div className="rounded-[3px] border border-[#e5e5e5] bg-white p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">History</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">Groups over time</h2>
          <div className="mt-4">
            <MultiLineChart
              points={data.history}
              series={GROUPS.map((group) => ({ key: group.key, label: group.label, color: group.color }))}
              ariaLabel="Consent, audit and security scores over time"
            />
          </div>
        </div>
      </section>

      <section className="px-6 pb-8 lg:px-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Review</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Surfaces to inspect</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {SURFACES.map((surface) => (
            <Link
              key={surface.href}
              href={`/sites/${params.id}/privacy/${surface.href}`}
              className="group flex min-h-[160px] flex-col justify-between rounded-[3px] border border-[#e5e5e5] bg-white p-5 hover:border-black"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-9 place-items-center rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] text-[#525252]">
                  <surface.Icon aria-hidden className="h-4 w-4" />
                </span>
                <ArrowUpRight aria-hidden className="h-4 w-4 text-[#737373] group-hover:text-black" />
              </div>
              <div>
                <p className="text-lg font-semibold">{surface.label}</p>
                <p className="mt-1 text-sm text-[#737373]">{surface.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <HistoryTable rows={data.history} />
    </div>
  );
}

function HistoryTable({
  rows,
}: {
  rows: PrivacyOverview["history"];
}) {
  const [page, setPage] = useState(1);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.at.localeCompare(a.at)),
    [rows],
  );

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const visible = sorted.slice(start, start + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  return (
    <section className="border-t border-[#e5e5e5] px-6 py-10 lg:px-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Runs</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Scan history</h2>
        </div>
        <p className="text-sm text-[#737373]">{sorted.length} total</p>
      </div>

      <div className="overflow-hidden rounded-[3px] border border-[#e5e5e5] bg-white">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-[#fafafa] text-[11px] uppercase tracking-[0.12em] text-[#737373]">
              <th scope="col" className="px-5 py-3 font-medium">Date</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Overall</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Consent</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Audit</th>
              <th scope="col" className="py-3 pl-3 pr-5 text-right font-medium">Security</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.at} className="border-t border-[#e5e5e5]">
                <td className="px-5 py-3 text-sm font-medium">{formatRun(row.at)}</td>
                <td className="px-3 py-3 text-right text-sm tabular-nums">{scoreCell(row.score)}</td>
                <td className="px-3 py-3 text-right text-sm tabular-nums text-[#525252]">{scoreCell(row.consent)}</td>
                <td className="px-3 py-3 text-right text-sm tabular-nums text-[#525252]">{scoreCell(row.audit)}</td>
                <td className="py-3 pl-3 pr-5 text-right text-sm tabular-nums text-[#525252]">{scoreCell(row.security)}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-[#737373]">
                  No completed scans yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sorted.length > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="grid size-9 place-items-center rounded-[3px] border border-[#e5e5e5] disabled:opacity-30"
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[7rem] text-center text-[#525252]">
            Page {safePage} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={safePage >= pageCount}
            className="grid size-9 place-items-center rounded-[3px] border border-[#e5e5e5] disabled:opacity-30"
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
