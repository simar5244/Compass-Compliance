"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Search } from "lucide-react";

import {
  getModuleHistory,
  getSiteChecksFull,
  type SiteCheckRow,
} from "@/lib/auth";

const TABS = ["Checks", "Content with issues"] as const;
const PAGE_SIZE = 10;
const INTRO =
  "Improve the accessibility of content in this website. This ignores technical issues and focuses on areas content editors can improve.";

type Tone = "assisted" | "error" | "warning" | "info";

function toneOf(row: SiteCheckRow): Tone {
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

function ToneMark({ tone }: { tone: Tone }) {
  const label =
    tone === "error" ? "Error" : tone === "warning" ? "Warning" : tone === "assisted" ? "Assisted" : "Info";
  return (
    <span
      aria-label={label}
      className={`mt-0.5 inline-block h-2 w-2 flex-none rounded-full ${
        tone === "error" ? "bg-black" : tone === "warning" ? "bg-[#525252]" : "bg-[#d4d4d4]"
      }`}
    />
  );
}

export default function ContentAccessibilityPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [loaded, setLoaded] = useState<{
    key: string;
    checks: SiteCheckRow[] | null;
    error: string | null;
  }>({ key: "", checks: null, error: null });
  const [series, setSeries] = useState<{ at: string; score: number }[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]>(TABS[0]);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [page, setPage] = useState(0);

  const requestKey = params.id;
  const fresh = loaded.key === requestKey ? loaded : null;
  const checks = fresh?.checks ?? null;
  const error = fresh?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    getSiteChecksFull(params.id, "content-accessibility")
      .then((r) => {
        if (!cancelled) setLoaded({ key: requestKey, checks: r.checks, error: null });
      })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey,
            checks: null,
            error: e instanceof Error ? e.message : "Failed to load content accessibility",
          });
        }
      });
    getModuleHistory(params.id, "content-accessibility")
      .then((r) => {
        if (!cancelled) setSeries(r.points.map((p) => ({ at: p.at, score: p.score })));
      })
      .catch(() => {
        if (!cancelled) setSeries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, requestKey]);

  const latest = series.at(-1)?.score ?? null;
  const previous = series.length > 1 ? series.at(-2)!.score : null;
  const delta = latest != null && previous != null ? latest - previous : null;
  const openIssues = useMemo(
    () => (checks ?? []).reduce((sum, row) => sum + (row.issues ?? 0), 0),
    [checks],
  );
  const withIssues = useMemo(
    () => (checks ?? []).filter((row) => (row.issues ?? 0) > 0),
    [checks],
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? (checks ?? []).filter((row) => (row.display_name ?? row.check_id).toLowerCase().includes(query))
      : (checks ?? []);
    return [...filtered].sort((a, b) => completenessRank(a) - completenessRank(b));
  }, [checks, search]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const slice = visible.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  if (error) {
    return (
      <div className="bg-white px-6 py-10 text-black lg:px-12">
        <p className="text-sm">{error.includes("404") ? "No completed scan yet." : error}</p>
      </div>
    );
  }
  if (!checks) return <CompassLoader fullPage label="Loading content accessibility…" />;

  return (
    <div className="light-theme bg-white text-black">
      <header className="border-b border-[#e5e5e5] px-6 py-10 lg:px-12 lg:py-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Content</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight lg:text-4xl">Content accessibility</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#525252]">{INTRO}</p>

        <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
          <div className="border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Score</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
              {latest == null ? "—" : `${Math.round(latest)}%`}
            </p>
            {delta != null && delta !== 0 ? (
              <p className="mt-1 text-[12px] text-[#525252]">
                {delta > 0 ? "Up" : "Down"} {Math.abs(delta).toFixed(2)}% vs last run
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-[#737373]">
                {latest == null ? "Not scored yet" : "No previous run to compare"}
              </p>
            )}
          </div>
          <div className="border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Checks</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{checks.length}</p>
          </div>
          <div className="border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Open issues</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
              {openIssues.toLocaleString("en-US")}
            </p>
          </div>
        </div>
      </header>

      <section className="border-b border-[#e5e5e5] px-6 py-8 lg:px-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Score over time</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">Content accessibility trend</h2>
        <div className="mt-4 border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
          <ScoreTrend series={series} />
        </div>
      </section>

      <section className="px-6 py-8 lg:px-12">
        <div className="mb-4 flex gap-1 border-b border-[#e5e5e5]">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              aria-current={tab === item ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium ${
                tab === item
                  ? "border-black text-black"
                  : "border-transparent text-[#737373] hover:text-black"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {tab === "Checks" ? (
          <div className="overflow-hidden border border-[#e5e5e5] bg-white rounded-[3px]">
            <div className="flex items-center gap-3 border-b border-[#e5e5e5] px-5 py-4">
              <h2 className="text-lg font-semibold">Checks</h2>
              <span className="border border-[#e5e5e5] bg-[#fafafa] px-2 py-0.5 text-[12px] font-medium text-[#525252] rounded-[3px]">
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
                    className="h-9 w-[220px] border border-[#e5e5e5] bg-white px-3 text-sm text-black outline-none placeholder:text-[#a3a3a3] focus:border-black rounded-[3px]"
                  />
                )}
                <button
                  type="button"
                  aria-label="Search"
                  onClick={() => setSearchOpen((open) => !open)}
                  className="grid h-9 w-9 place-items-center border border-[#e5e5e5] bg-white text-black hover:bg-[#fafafa] rounded-[3px]"
                >
                  <Search aria-hidden className="h-4 w-4" />
                </button>
              </div>
            </div>

            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#e5e5e5] bg-[#fafafa] text-[11px] uppercase tracking-[0.12em] text-[#737373]">
                  <th scope="col" className="px-5 py-3 font-medium">Name</th>
                  <th scope="col" className="w-[90px] px-3 py-3 text-right font-medium">Issues</th>
                  <th scope="col" className="w-[190px] py-3 pl-3 pr-5 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((row) => (
                  <tr key={row.check_id} className="border-b border-[#e5e5e5] last:border-b-0 hover:bg-[#fafafa]">
                    <td className="px-5 py-3">
                      <span className="flex items-start gap-2.5">
                        <ToneMark tone={toneOf(row)} />
                        <span>
                          <button
                            type="button"
                            onClick={() => router.push(`/sites/${params.id}/checks/${row.check_id}`)}
                            className="text-left text-[14px] font-medium text-black hover:underline"
                          >
                            {row.display_name ?? row.check_id}
                          </button>
                          {row.wcag_criterion && (
                            <span className="ml-2 text-[13px] text-[#737373]">{row.wcag_criterion}</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-[14px] tabular-nums text-[#525252]">
                      {row.issues ?? "—"}
                    </td>
                    <td className="py-3 pl-3 pr-5">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-1.5 w-full overflow-hidden bg-[#e5e5e5] rounded-[3px]"
                          role="progressbar"
                          aria-valuenow={row.progress ?? undefined}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Progress for ${row.display_name ?? row.check_id}`}
                        >
                          {row.progress != null && (
                            <div
                              className="h-full bg-black"
                              style={{ width: `${Math.max(0, Math.min(100, Math.round(row.progress)))}%` }}
                            />
                          )}
                        </div>
                        <span className="w-[46px] flex-none text-right text-[13px] tabular-nums text-[#525252]">
                          {row.progress == null ? "—" : `${Math.round(row.progress)}%`}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
                {slice.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-10 text-center text-sm text-[#737373]">
                      {checks.length === 0
                        ? "No content accessibility checks in the latest scan."
                        : `No checks match “${search}”.`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {pageCount > 1 && (
              <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1 border-t border-[#e5e5e5] py-4">
                {Array.from({ length: pageCount }).map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setPage(index)}
                    aria-current={index === current ? "page" : undefined}
                    className={`h-8 min-w-8 px-2 text-[13px] font-medium rounded-[3px] ${
                      index === current
                        ? "border border-black bg-black text-white"
                        : "border border-[#e5e5e5] bg-white text-black hover:bg-[#fafafa]"
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </nav>
            )}
          </div>
        ) : (
          <div className="overflow-hidden border border-[#e5e5e5] bg-white rounded-[3px]">
            <div className="flex items-center gap-3 border-b border-[#e5e5e5] px-5 py-4">
              <h2 className="text-lg font-semibold">Content with issues</h2>
              <span className="border border-[#e5e5e5] bg-[#fafafa] px-2 py-0.5 text-[12px] font-medium text-[#525252] rounded-[3px]">
                {withIssues.length}
              </span>
            </div>
            {withIssues.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-[#737373]">No issues in the latest scan.</p>
            ) : (
              <ul>
                {withIssues.map((row) => (
                  <li
                    key={row.check_id}
                    className="flex items-center gap-3 border-b border-[#e5e5e5] px-5 py-3 last:border-b-0 hover:bg-[#fafafa]"
                  >
                    <ToneMark tone={toneOf(row)} />
                    <button
                      type="button"
                      onClick={() => router.push(`/sites/${params.id}/checks/${row.check_id}`)}
                      className="flex-1 text-left text-[14px] font-medium text-black hover:underline"
                    >
                      {row.display_name ?? row.check_id}
                    </button>
                    <span className="text-[14px] tabular-nums text-[#525252]">
                      {row.issues?.toLocaleString("en-US")} {row.issues === 1 ? "issue" : "issues"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ScoreTrend({ series }: { series: { at: string; score: number }[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (series.length === 0) {
    return <p className="py-8 text-center text-[13px] text-[#737373]">No completed runs yet.</p>;
  }
  if (series.length === 1) {
    return (
      <p className="py-8 text-center text-[13px] text-[#737373]">
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
            <line x1={pad} x2={width - pad} y1={y(line)} y2={y(line)} stroke="#e5e5e5" strokeWidth="1" />
            <text x={0} y={y(line) + 3} fontSize="10" fill="#a3a3a3">
              {line}
            </text>
          </g>
        ))}
        <polyline points={points.join(" ")} fill="none" stroke="#000000" strokeWidth="2" />
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
            fill="#000000"
            pointerEvents="none"
          />
        ))}
      </svg>
      {hovered != null && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap border border-black bg-black px-2 py-1 text-[11px] font-medium text-white"
          style={{ left: `${((pad + hovered * step) / width) * 100}%`, top: "0" }}
        >
          {Math.round(series[hovered].score)}% — {new Date(series[hovered].at).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
