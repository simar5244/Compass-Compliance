"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MoreHorizontal, Search, SlidersHorizontal } from "lucide-react";

import { getModuleHistory, getSiteChecksFull, type SiteCheckRow } from "@/lib/auth";
import { ScoreSparkline } from "@/components/platform/site/overview/OverviewPrimitives";

const TABS = ["Checks", "Content with issues"] as const;
type TabKey = (typeof TABS)[number];

const PAGE_SIZE = 10;

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

function CheckMark({ tone }: { tone: ReturnType<typeof toneOf> }) {
  if (tone === "error") {
    return (
      <span
        aria-hidden
        className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#111] text-[13px] font-bold leading-none text-white"
      >
        !
      </span>
    );
  }
  if (tone === "assisted") {
    return (
      <span
        aria-hidden
        className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#6b7280] text-[12px] font-bold text-white"
      >
        ×
      </span>
    );
  }
  if (tone === "warning") {
    return (
      <span aria-hidden className="relative inline-block h-5 w-5 flex-none text-[#6b7280]">
        <span className="absolute -top-[5px] left-0 text-[25px] leading-none">▲</span>
        <span className="absolute left-[8px] top-[2px] text-[11px] font-bold leading-none text-white">!</span>
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex h-[19px] w-[19px] flex-none items-center justify-center rounded-[3px] bg-[#9ca3af] text-[12px] font-bold text-white"
    >
      !
    </span>
  );
}

function ScoreRing({ score }: { score: number | null }) {
  const size = 96;
  const stroke = 8;
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
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="#ffffff"
          stroke="#d1d5db"
          strokeWidth={stroke}
        />
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
      <span className="absolute text-[24px] font-bold text-[#111]">
        {score == null ? "—" : Math.round(score)}
        {score != null && <span className="ml-px align-top text-[0.55em]">%</span>}
      </span>
    </span>
  );
}

export default function FunctionalityPage() {
  const params = useParams<{ id: string }>();
  const requestKey = params.id;
  const [tab, setTab] = useState<TabKey>("Checks");
  const [loaded, setLoaded] = useState<{
    key: string;
    checks: SiteCheckRow[] | null;
    history: { at: string; value: number }[] | null;
    error: string | null;
  }>({ key: "", checks: null, history: null, error: null });

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSiteChecksFull(params.id, "functionality"), getModuleHistory(params.id, "functionality")])
      .then(([checks, history]) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey,
            checks: checks.checks,
            history: history.points.map((point) => ({ at: point.at, value: point.score })),
            error: null,
          });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey,
            checks: null,
            history: null,
            error: e instanceof Error ? e.message : "Failed to load functionality",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, requestKey]);

  const fresh = loaded.key === requestKey ? loaded : null;
  const checks = fresh?.checks ?? null;
  const history = fresh?.history ?? [];
  const error = fresh?.error ?? null;

  const latest = history.at(-1)?.value ?? null;
  const previous = history.length > 1 ? history.at(-2)!.value : null;
  const delta = latest != null && previous != null ? latest - previous : null;

  if (error) {
    return (
      <div className="light-theme p-8 text-sm text-[#6b7280]">
        {error.includes("404") ? "No completed scan yet." : error}
      </div>
    );
  }
  if (!checks) return <CompassLoader fullPage label="Loading functionality…" />;

  return (
    <div className="light-theme px-6 py-6">
      <h1 className="text-[30px] font-semibold leading-9 text-[#111]">Functionality</h1>
      <p className="mt-1.5 max-w-[85ch] text-[14px] leading-6 text-[#4b5563]">
        Identify faults with functionality on this website — forms, interactive controls, and other
        features that should work for every visitor.
      </p>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <section className="rounded-[6px] border border-[#e5e7eb] bg-white">
          <h2 className="border-b border-[#e5e7eb] px-5 py-3.5 text-[15px] font-semibold text-[#111]">
            Functionality
          </h2>
          <div className="flex flex-col items-center px-5 py-7">
            <ScoreRing score={latest} />
            {delta != null && delta !== 0 && (
              <p className="mt-2 text-[13px] font-medium text-[#111]">
                {delta > 0 ? "↑ Up" : "↓ Down"} {Math.abs(delta).toFixed(2)}%
              </p>
            )}
            {delta === 0 && (
              <p className="mt-2 text-[13px] text-[#6b7280]">No change since the last run</p>
            )}
            {delta == null && latest != null && (
              <p className="mt-2 text-[13px] text-[#6b7280]">No previous run to compare</p>
            )}
          </div>
        </section>

        <section className="rounded-[6px] border border-[#e5e7eb] bg-white p-5">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
            Functionality over time
          </h2>
          <ScoreSparkline points={history} />
        </section>
      </div>

      <div className="mt-5 overflow-hidden rounded-[6px] border border-[#e5e7eb] bg-white">
        <div className="flex border-b border-[#e5e7eb]">
          {TABS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTab(option)}
              aria-current={option === tab ? "page" : undefined}
              className={`px-6 py-3 text-[14px] font-medium ${
                option === tab
                  ? "border-b-2 border-[#111] text-[#111]"
                  : "text-[#6b7280] hover:text-[#111]"
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {tab === "Checks" ? (
          <ChecksTable checks={checks} />
        ) : (
          <IssuesTab checks={checks} />
        )}
      </div>
    </div>
  );
}

function ChecksTable({ checks }: { checks: SiteCheckRow[] }) {
  const params = useParams<{ id: string }>();
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
        <h2 className="text-[20px] font-semibold text-[#111]">Checks</h2>
        <span className="rounded-full bg-[#f3f4f6] px-2.5 py-0.5 text-[13px] font-semibold text-[#374151]">
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
              className="h-9 w-[200px] rounded-[4px] border border-[#d1d5db] bg-white px-3 text-sm text-[#111] outline-none focus:border-[#111]"
            />
          )}
          <button
            type="button"
            aria-label="Columns"
            className="flex h-9 items-center gap-1.5 rounded-[4px] border border-[#d1d5db] px-3 text-[13px] font-medium text-[#374151]"
          >
            <SlidersHorizontal aria-hidden className="h-4 w-4" /> Columns
          </button>
          <button
            type="button"
            aria-label="Search"
            onClick={() => setSearchOpen((previous) => !previous)}
            className="grid h-9 w-9 place-items-center rounded-[4px] border border-[#d1d5db] text-[#374151]"
          >
            <Search aria-hidden className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="More options"
            className="grid h-9 w-9 place-items-center rounded-[4px] border border-[#d1d5db] text-[#374151]"
          >
            <MoreHorizontal aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="h-[calc(100vh-420px)] min-h-[220px] overflow-auto">
        <table className="w-full border-t border-[#e5e7eb] text-left">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#f9fafb] text-[13px] text-[#6b7280]">
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
              <tr key={row.check_id} className="border-t border-[#f3f4f6]">
                <td className="px-5 py-3">
                  <span className="flex items-start gap-2.5">
                    <CheckMark tone={toneOf(row)} />
                    <span>
                      <button
                        type="button"
                        onClick={() => router.push(`/sites/${params.id}/checks/${row.check_id}`)}
                        className="text-left text-[14px] font-medium text-[#111] underline-offset-2 hover:underline"
                      >
                        {row.display_name ?? row.check_id}
                      </button>
                      {row.wcag_criterion && (
                        <span className="ml-2 text-[13px] text-[#6b7280]">{row.wcag_criterion}</span>
                      )}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-[14px] text-[#374151]">{row.issues ?? "—"}</td>
                <td className="py-3 pl-3 pr-5">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-[#e5e7eb]"
                      role="progressbar"
                      aria-valuenow={row.progress ?? undefined}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Progress for ${row.display_name ?? row.check_id}`}
                    >
                      {row.progress != null && (
                        <div
                          className="h-full rounded-full bg-[#111]"
                          style={{ width: `${Math.max(0, Math.min(100, Math.round(row.progress)))}%` }}
                        />
                      )}
                    </div>
                    <span className="w-[46px] flex-none text-right text-[13px] text-[#374151]">
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
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1 border-t border-[#f3f4f6] py-4">
          {Array.from({ length: pageCount }).map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setPage(index)}
              aria-current={index === current ? "page" : undefined}
              className={`h-8 min-w-8 rounded-[4px] px-2 text-[13px] font-medium ${
                index === current ? "bg-[#111] text-white" : "text-[#111] hover:bg-[#f3f4f6]"
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

function IssuesTab({ checks }: { checks: SiteCheckRow[] }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const withIssues = checks.filter((row) => (row.issues ?? 0) > 0);

  return (
    <div className="px-5 py-4">
      <h2 className="mb-3 text-[20px] font-semibold text-[#111]">Content with issues</h2>
      {withIssues.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#6b7280]">No issues in the latest scan.</p>
      ) : (
        <ul className="divide-y divide-[#f3f4f6]">
          {withIssues.map((row) => (
            <li key={row.check_id} className="flex items-center gap-3 py-3">
              <CheckMark tone={toneOf(row)} />
              <button
                type="button"
                onClick={() => router.push(`/sites/${params.id}/checks/${row.check_id}`)}
                className="flex-1 text-left text-[14px] font-medium text-[#111] underline-offset-2 hover:underline"
              >
                {row.display_name ?? row.check_id}
              </button>
              <span className="text-[14px] text-[#374151]">
                {row.issues?.toLocaleString("en-US")} {row.issues === 1 ? "issue" : "issues"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
