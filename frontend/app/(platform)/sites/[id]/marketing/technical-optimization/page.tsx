"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MoreHorizontal, Search, SlidersHorizontal } from "lucide-react";

import { getModuleHistory, getSiteChecksFull, type SiteCheckRow } from "@/lib/auth";

const TABS = ["Checks", "Content with issues"] as const;
const PAGE_SIZE = 10;
const MODULE = "technical-optimization";

function toneOf(row: SiteCheckRow): "assisted" | "error" | "warning" | "info" {
  if (row.assisted) return "assisted";
  if (row.catalog_severity === "error") return "error";
  return row.catalog_severity === "warning" ? "warning" : "info";
}

function completenessRank(row: SiteCheckRow): number {
  const hasScore = row.check_score != null;
  const hasProgress = row.progress != null;
  if (hasScore && hasProgress) return 0;
  if (hasScore || hasProgress) return 1;
  return 2;
}

export default function TechnicalOptimizationPage() {
  const params = useParams<{ id: string }>();
  const requestKey = `${params.id}:${MODULE}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    checks: SiteCheckRow[] | null;
    series: { at: string; score: number }[] | null;
    error: string | null;
  }>({ key: "", checks: null, series: null, error: null });
  const [tab, setTab] = useState<(typeof TABS)[number]>("Checks");

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSiteChecksFull(params.id, MODULE), getModuleHistory(params.id, MODULE)])
      .then(([checks, history]) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey,
            checks: checks.checks,
            series: history.points.map((point) => ({ at: point.at, score: point.score })),
            error: null,
          });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey,
            checks: null,
            series: null,
            error: e instanceof Error ? e.message : "Failed to load technical optimization",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, requestKey]);

  const fresh = loaded.key === requestKey ? loaded : null;
  const checks = fresh?.checks ?? null;
  const series = fresh?.series ?? [];
  const error = fresh?.error ?? null;
  const latest = series.at(-1)?.score ?? null;
  const previous = series.length > 1 ? series.at(-2)!.score : null;
  const delta = latest != null && previous != null ? latest - previous : null;

  if (error) {
    return (
      <div className="light-theme p-8 text-sm text-[#6b7280]">
        {error.includes("404") ? "No completed scan yet." : error}
      </div>
    );
  }
  if (!checks) return <CompassLoader fullPage label="Loading technical optimization…" />;

  return (
    <div className="light-theme px-6 py-6">
      <h1 className="mb-4 text-[26px] font-semibold text-black">Technical optimization</h1>

      <section className="mb-5 rounded-[6px] border border-[#e5e8ec] bg-white p-6">
        <h2 className="text-[18px] font-semibold text-black">Optimize your technology</h2>
        <p className="mt-1.5 max-w-[70ch] text-[14px] leading-[1.6] text-[#5b626b]">
          Improve the technical aspects of this website&apos;s marketing. This ignores content issues and
          focuses on areas developers can improve.
        </p>
      </section>

      <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <section className="rounded-[6px] border border-[#e5e8ec] bg-white p-5">
          <h3 className="text-[15px] font-semibold text-black">Technical optimization</h3>
          <div className="mt-2 flex flex-col items-center">
            <ScoreRing score={latest} />
            {delta != null && delta !== 0 && (
              <p className="mt-2 text-[11px] font-medium text-[#5b626b]">
                {delta > 0 ? "↑ Up" : "↓ Down"} {Math.abs(delta).toFixed(2)}%
              </p>
            )}
            {delta === null && latest != null && (
              <p className="mt-2 text-[13px] text-[#6b7280]">No previous run to compare</p>
            )}
          </div>
        </section>
        <section className="flex min-h-[160px] flex-col rounded-[6px] border border-[#e5e8ec] bg-white p-4">
          <h3 className="mb-2 text-[13px] font-normal text-black">Score over time</h3>
          <ScoreTrend series={series} />
        </section>
      </div>

      <div className="rounded-[6px] border border-[#e5e8ec] bg-white">
        <div className="flex border-b border-[#e5e8ec]">
          {TABS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTab(option)}
              aria-current={option === tab ? "page" : undefined}
              className={`px-6 py-3 text-[14px] font-medium ${
                option === tab
                  ? "border-b-2 border-black text-black"
                  : "text-[#5b626b] hover:text-black"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        {tab === "Checks" ? (
          <ChecksTable checks={checks} siteId={params.id} />
        ) : (
          <IssuesList checks={checks} siteId={params.id} />
        )}
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number | null }) {
  const size = 80;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <span
      className="relative inline-flex flex-none items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={score == null ? "No score" : `Score ${Math.round(score)} percent`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="#ffffff" stroke="#e5e8ec" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#111111"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - (score ?? 0) / 100)}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-[20px] font-semibold text-black">
        {score == null ? "—" : Math.round(score)}
        {score != null && <span className="ml-px align-top text-[0.55em]">%</span>}
      </span>
    </span>
  );
}

function ScoreTrend({ series }: { series: { at: string; score: number }[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (series.length === 0) {
    return <p className="py-8 text-center text-[13px] text-[#6b7280]">No completed runs yet.</p>;
  }
  if (series.length === 1) {
    return (
      <p className="py-8 text-center text-[13px] text-[#6b7280]">
        One run so far, scoring {Math.round(series[0].score)}%. A trend appears from the second run.
      </p>
    );
  }

  const width = 1200;
  const height = 90;
  const pad = 10;
  const step = (width - pad * 2) / (series.length - 1);
  const y = (score: number) => pad + (1 - score / 100) * (height - pad * 2);
  const points = series.map((point, index) => `${pad + index * step},${y(point.score)}`);

  return (
    <div className="relative flex-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMinYMid meet"
        className="h-[90px] w-full"
        role="img"
        aria-label="Score over time"
        onMouseLeave={() => setHovered(null)}
      >
        {[0, 50, 100].map((line) => (
          <g key={line}>
            <line x1={pad} x2={width - pad} y1={y(line)} y2={y(line)} stroke="#e5e8ec" strokeWidth="1" />
            <text x={0} y={y(line) + 3} fontSize="10" fill="#8b9099">
              {line}
            </text>
          </g>
        ))}
        <polyline points={points.join(" ")} fill="none" stroke="#111111" strokeWidth="2.5" />
        {series.map((point, index) => (
          <circle
            key={point.at}
            cx={pad + index * step}
            cy={y(point.score)}
            r="7"
            fill="transparent"
            tabIndex={0}
            aria-label={`${Math.round(point.score)}% on ${new Date(point.at).toLocaleDateString()}`}
            onMouseEnter={() => setHovered(index)}
            onFocus={() => setHovered(index)}
            onBlur={() => setHovered(null)}
          >
            <title>{`${Math.round(point.score)}% — ${new Date(point.at).toLocaleDateString()}`}</title>
          </circle>
        ))}
        {series.map((point, index) => (
          <circle
            key={`marker-${point.at}`}
            cx={pad + index * step}
            cy={y(point.score)}
            r="2.5"
            fill="#111111"
            pointerEvents="none"
          />
        ))}
      </svg>
      {hovered != null && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-black px-2 py-1 text-[11px] font-medium text-white"
          style={{ left: `${((pad + hovered * step) / width) * 100}%`, top: "0" }}
        >
          {Math.round(series[hovered].score)}% — {new Date(series[hovered].at).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

function ToneMark({ tone }: { tone: ReturnType<typeof toneOf> }) {
  const label = tone === "error" ? "!" : tone === "warning" ? "▲" : tone === "assisted" ? "×" : "i";
  return (
    <span
      aria-hidden
      className={`inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-bold leading-none ${
        tone === "error"
          ? "bg-black text-white"
          : tone === "assisted"
            ? "bg-[#6b7280] text-white"
            : "border border-[#c8ced6] bg-[#f5f6f8] text-[#3f4650]"
      }`}
    >
      {label}
    </span>
  );
}

function ChecksTable({ checks, siteId }: { checks: SiteCheckRow[]; siteId: string }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [page, setPage] = useState(0);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? checks.filter((row) => (row.display_name ?? row.check_id).toLowerCase().includes(query))
      : checks;
    return [...filtered].sort((a, b) => completenessRank(a) - completenessRank(b));
  }, [checks, search]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const slice = visible.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <>
      <div className="flex items-center gap-2 px-5 py-4">
        <h2 className="text-[20px] font-semibold text-black">Checks</h2>
        <span className="rounded-full bg-[#eceff3] px-2.5 py-0.5 text-[13px] font-semibold text-[#3f4650]">
          {visible.length}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {searchOpen && (
            <input
              autoFocus
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder="Search checks"
              aria-label="Search checks"
              className="h-9 w-[200px] rounded-[4px] border border-[#c8ced6] px-3 text-sm outline-none focus:border-black"
            />
          )}
          <button
            type="button"
            aria-label="Columns"
            className="flex h-9 items-center gap-1.5 rounded-[4px] border border-[#c8ced6] px-3 text-[13px] font-medium text-[#3f4650]"
          >
            <SlidersHorizontal aria-hidden className="h-4 w-4" /> Columns
          </button>
          <button
            type="button"
            aria-label="Search"
            onClick={() => setSearchOpen((previous) => !previous)}
            className="grid h-9 w-9 place-items-center rounded-[4px] border border-[#c8ced6] text-[#3f4650]"
          >
            <Search aria-hidden className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="More options"
            className="grid h-9 w-9 place-items-center rounded-[4px] border border-[#c8ced6] text-[#3f4650]"
          >
            <MoreHorizontal aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="h-[calc(100vh-420px)] min-h-[220px] overflow-auto">
        <table className="w-full border-t border-[#e5e8ec] text-left">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#fafbfc] text-[13px] text-[#5b626b]">
              <th scope="col" className="px-5 py-3 font-medium">
                Name
              </th>
              <th scope="col" className="w-[90px] px-3 py-3 text-right font-medium">
                Issues
              </th>
              <th scope="col" className="w-[190px] py-3 pl-3 pr-5 font-medium">
                Progress
              </th>
            </tr>
          </thead>
          <tbody>
            {slice.map((row) => (
              <tr key={row.check_id} className="border-t border-[#eceff3]">
                <td className="px-5 py-3">
                  <span className="flex items-start gap-2.5">
                    <ToneMark tone={toneOf(row)} />
                    <button
                      type="button"
                      onClick={() => router.push(`/sites/${siteId}/checks/${row.check_id}`)}
                      className="text-left text-[14px] font-medium text-black hover:underline"
                    >
                      {row.display_name ?? row.check_id}
                    </button>
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-[14px] text-[#3f4650]">{row.issues ?? "—"}</td>
                <td className="py-3 pl-3 pr-5">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-[#e5e8ec]"
                      role="progressbar"
                      aria-valuenow={row.progress ?? undefined}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Progress for ${row.display_name ?? row.check_id}`}
                    >
                      {row.progress != null && (
                        <div
                          className="h-full rounded-full bg-black"
                          style={{ width: `${Math.max(0, Math.min(100, Math.round(row.progress)))}%` }}
                        />
                      )}
                    </div>
                    <span className="w-[46px] flex-none text-right text-[13px] text-[#3f4650]">
                      {row.progress == null ? "—" : `${Math.round(row.progress)}%`}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
            {slice.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-10 text-center text-sm text-[#6b7280]">
                  No checks match “{search}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <nav
          aria-label="Pagination"
          className="flex flex-wrap items-center justify-center gap-1 border-t border-[#eceff3] py-4"
        >
          {Array.from({ length: pageCount }).map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setPage(index)}
              aria-current={index === current ? "page" : undefined}
              className={`h-8 min-w-8 rounded-[4px] px-2 text-[13px] font-medium ${
                index === current ? "bg-black text-white" : "text-[#3f4650] hover:bg-[#f5f6f8]"
              }`}
            >
              {index + 1}
            </button>
          ))}
        </nav>
      )}
    </>
  );
}

function IssuesList({ checks, siteId }: { checks: SiteCheckRow[]; siteId: string }) {
  const router = useRouter();
  const withIssues = checks.filter((row) => (row.issues ?? 0) > 0);

  return (
    <div className="px-5 py-4">
      <h2 className="mb-3 text-[20px] font-semibold text-black">Content with issues</h2>
      {withIssues.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#6b7280]">No issues in the latest scan.</p>
      ) : (
        <ul className="divide-y divide-[#eceff3]">
          {withIssues.map((row) => (
            <li key={row.check_id} className="flex items-center gap-3 py-3">
              <ToneMark tone={toneOf(row)} />
              <button
                type="button"
                onClick={() => router.push(`/sites/${siteId}/checks/${row.check_id}`)}
                className="flex-1 text-left text-[14px] font-medium text-black hover:underline"
              >
                {row.display_name ?? row.check_id}
              </button>
              <span className="text-[14px] text-[#3f4650]">
                {row.issues?.toLocaleString("en-US")} {row.issues === 1 ? "issue" : "issues"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
