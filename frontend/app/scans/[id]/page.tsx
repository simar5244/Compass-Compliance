"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { InspectorScoreRing } from "@/components/inspector/InspectorScoreRing";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CATEGORY_LABELS,
  createScan,
  getScan,
  getScanChecks,
  getScanIssues,
  getScanPages,
  type CheckScore,
  type IssueGroup,
  type PageSummary,
  type ScanSummary,
} from "@/lib/api";

const IN_PROGRESS = new Set(["pending", "crawling", "scoring"]);

const CATEGORY_ORDER = ["accessibility", "content", "marketing", "ux"] as const;

const LEVEL_SECTIONS: { key: "A" | "AA" | "AAA" | "bp"; label: string }[] = [
  { key: "A", label: "Level A" },
  { key: "AA", label: "Level AA" },
  { key: "AAA", label: "Level AAA" },
  { key: "bp", label: "Best practice" },
];

const PAGE_SIZE = 10;

const CAT_DESC: Record<string, string> = {
  accessibility: "WCAG 2.2 across every captured page",
  content: "Voice, grammar, links, and readability",
  marketing: "Message, SEO, and content depth",
  ux: "Speed, vitals, and how it feels to use",
};

function scoreTone(score: number | null | undefined): string {
  if (score == null) return "text-[#737373]";
  if (score >= 90) return "text-black";
  if (score >= 70) return "text-[#525252]";
  return "text-[#737373]";
}

function bandTone(band: string | null): string {
  switch (band) {
    case "Excellent":
    case "Great":
      return "bg-black text-white";
    case "Good":
    case "Fair":
      return "border border-[#e5e5e5] bg-[#f5f5f5] text-black";
    default:
      return "border border-[#e5e5e5] bg-white text-[#737373]";
  }
}

function Pager({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-sm">
      <button
        type="button"
        onClick={() => onPage(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="grid size-9 place-items-center rounded-[3px] border border-[#e5e5e5] disabled:opacity-30"
        aria-label="Previous page"
      >
        ‹
      </button>
      <span className="min-w-[7rem] text-center text-[#525252]">
        Page {page} of {pageCount}
      </span>
      <button
        type="button"
        onClick={() => onPage(Math.min(pageCount, page + 1))}
        disabled={page >= pageCount}
        className="grid size-9 place-items-center rounded-[3px] border border-[#e5e5e5] disabled:opacity-30"
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  );
}

function SeverityDot({ impact }: { impact: string | null }) {
  const color =
    impact === "critical" || impact === "serious"
      ? "bg-black"
      : impact === "moderate"
        ? "bg-[#525252]"
        : "bg-[#e5e5e5]";
  return <span className={`inline-block h-2 w-2 flex-none rounded-[3px] ${color}`} />;
}

function IssueDetail({ issue }: { issue: IssueGroup }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(issue.instances.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = issue.instances.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [issue.rule_id]);

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Issue</p>
      <div className="mt-3 mb-4 flex flex-wrap items-center gap-2">
        <SeverityDot impact={issue.impact} />
        {issue.impact && (
          <span className="text-xs font-medium capitalize text-[#737373]">{issue.impact}</span>
        )}
        {issue.manual_review && (
          <span className="rounded-[3px] border border-black px-2 py-0.5 text-xs font-medium text-black">
            Manual review
          </span>
        )}
        {issue.category !== "accessibility" ? (
          <span className="rounded-[3px] border border-[#e5e5e5] bg-[#f5f5f5] px-2 py-0.5 text-xs font-medium text-[#525252]">
            {CATEGORY_LABELS[issue.category] ?? issue.category}
            {issue.subcategory ? ` · ${issue.subcategory}` : ""}
          </span>
        ) : issue.criterion_id ? (
          <span className="rounded-[3px] border border-[#e5e5e5] bg-[#f5f5f5] px-2 py-0.5 text-xs font-medium text-[#525252]">
            WCAG {issue.wcag_version} · {issue.criterion_id} {issue.criterion_name} (Level {issue.wcag_level})
          </span>
        ) : (
          <span className="rounded-[3px] border border-[#e5e5e5] bg-[#f5f5f5] px-2 py-0.5 text-xs font-medium text-[#525252]">
            Best practice
          </span>
        )}
        <code className="text-xs text-[#737373]">{issue.rule_id}</code>
      </div>

      <h1 className="text-3xl font-semibold tracking-tight text-black lg:text-[36px]">{issue.description}</h1>
      {issue.manual_review && (
        <p className="mt-3 text-sm text-[#525252]">
          This item needs a human decision and is <strong>excluded from scoring</strong>.
        </p>
      )}

      <div className="mt-6 rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-5">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#737373]">How to fix</div>
        <p className="text-sm leading-6 text-black">{issue.remediation}</p>
        {issue.reference_url && (
          <a
            href={issue.reference_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs font-medium text-black underline underline-offset-2"
          >
            Reference: Understanding this criterion
          </a>
        )}
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold text-black">
        Affected pages ({issue.affected_page_count})
        {issue.total_instances > issue.instances.length &&
          ` · showing ${issue.instances.length} of ${issue.total_instances} instances`}
      </h2>
      <ul className="flex flex-col gap-3">
        {visible.map((inst, i) => (
          <li key={i} className="rounded-[3px] border border-[#e5e5e5] bg-white p-3 text-xs">
            <a
              href={inst.page_url}
              target="_blank"
              rel="noreferrer"
              className="break-all font-medium text-black underline underline-offset-2"
            >
              {inst.page_url}
            </a>
            {inst.selector && <div className="mt-1 text-[#737373]">{inst.selector}</div>}
            {inst.html_snippet && (
              <pre className="mt-2 w-full min-w-0 overflow-x-auto whitespace-pre rounded-[3px] bg-[#f5f5f5] p-2 font-mono text-[11px] text-[#525252]">
                <code className="whitespace-pre">{inst.html_snippet}</code>
              </pre>
            )}
          </li>
        ))}
      </ul>
      <Pager page={safePage} pageCount={pageCount} onPage={setPage} />
    </div>
  );
}

function ChecksTable({ checks }: { checks: CheckScore[] }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(checks.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = checks.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [checks.length]);

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Checks</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Every scored rule</h2>
        </div>
        <p className="text-sm text-[#737373]">{checks.length} total</p>
      </div>
      <div className="overflow-x-auto rounded-[3px] border border-[#e5e5e5] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#f5f5f5] text-left text-[#737373]">
            <tr>
              <th className="px-3 py-2 font-medium">Check</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Criterion / area</th>
              <th className="px-3 py-2 text-right font-medium">Pages</th>
              <th className="px-3 py-2 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={`${c.category}-${c.rule_id}`} className="border-t border-[#e5e5e5]">
                <td className="px-3 py-2 font-mono text-xs text-black">{c.rule_id}</td>
                <td className="px-3 py-2 text-[#737373]">{CATEGORY_LABELS[c.category] ?? c.category}</td>
                <td className="px-3 py-2 text-[#737373]">
                  {c.criterion_id
                    ? `${c.criterion_id} ${c.criterion_name}`
                    : c.subcategory || "Best practice"}
                  {c.wcag_level && <span className="ml-1 text-[#737373]">({c.wcag_level})</span>}
                </td>
                <td className="px-3 py-2 text-right text-black">{c.pages_affected}</td>
                <td className={`px-3 py-2 text-right font-semibold ${scoreTone(c.check_score)}`}>
                  {c.check_score}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={safePage} pageCount={pageCount} onPage={setPage} />
    </section>
  );
}

function Overview({
  scan,
  pages,
  checks,
}: {
  scan: ScanSummary;
  pages: PageSummary[] | null;
  checks: CheckScore[] | null;
}) {
  const [page, setPage] = useState(1);
  const pageList = pages ?? [];
  const pageCount = Math.max(1, Math.ceil(pageList.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visiblePages = pageList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [pageList.length]);

  const cats = CATEGORY_ORDER.map((cat) => ({
    key: cat,
    label: CATEGORY_LABELS[cat],
    desc: CAT_DESC[cat],
    score: scan.category_scores[cat] ?? null,
  }));
  const [lead, ...rest] = cats;

  const rings: { label: string; score: number | null }[] = [
    { label: "WCAG 2.2", score: scan.wcag_scores["wcag-22"] ?? scan.accessibility_score },
    { label: "Level A", score: scan.score_a },
    { label: "Level AA", score: scan.score_aa },
    { label: "Level AAA", score: scan.score_aaa },
  ];

  return (
    <div>
      <section className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Overview</p>
        <h1 className="mt-2 max-w-[18ch] text-[40px] font-semibold leading-[0.94] tracking-[-0.04em] text-black lg:text-[52px]">
          {scan.overall_score == null ? "—" : Math.round(scan.overall_score)}
          {scan.overall_score != null && <span className="text-[0.45em] align-top">%</span>}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className={`rounded-[3px] px-2 py-0.5 text-xs font-semibold ${bandTone(scan.overall_band)}`}>
            {scan.overall_band ?? "—"}
          </span>
          <span className="text-sm text-[#737373]">
            {scan.pages_crawled} pages
            {scan.pages_errored ? ` · ${scan.pages_errored} errored` : ""}
          </span>
        </div>
      </section>

      <section className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
        {lead && (
          <div className="flex min-h-[180px] flex-col justify-between rounded-[3px] bg-black p-6 text-white">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">{lead.label}</p>
              <p className="mt-3 text-[40px] font-semibold leading-none tracking-[-0.05em]">
                {lead.score == null ? "—" : Math.round(lead.score)}
              </p>
            </div>
            <p className="mt-4 text-sm text-white/60">{lead.desc}</p>
          </div>
        )}
        {rest.map((c) => (
          <div
            key={c.key}
            className="flex min-h-[180px] flex-col justify-between rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-6"
          >
            <p className="text-[32px] font-semibold leading-none tracking-[-0.05em] text-black">
              {c.score == null ? "—" : Math.round(c.score)}
            </p>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#737373]">{c.label}</p>
              <p className="mt-1 text-sm text-[#737373]">{c.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="mb-10 grid grid-cols-2 gap-3 border border-[#e5e5e5] p-5 sm:grid-cols-4">
        {rings.map((r) => (
          <div key={r.label}>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">{r.label}</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-black">
              {r.score == null ? "—" : Math.round(r.score)}
            </p>
          </div>
        ))}
      </div>

      {checks && <ChecksTable checks={checks} />}

      {pages && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Pages</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">Scanned URLs</h2>
            </div>
            <p className="text-sm text-[#737373]">{pages.length} total</p>
          </div>
          <div className="overflow-x-auto rounded-[3px] border border-[#e5e5e5] bg-white">
            <table className="w-full text-sm">
              <thead className="bg-[#f5f5f5] text-left text-[#737373]">
                <tr>
                  <th className="px-3 py-2 font-medium">Page</th>
                  <th className="px-3 py-2 text-right font-medium">2.2</th>
                  <th className="px-3 py-2 text-right font-medium">Issues</th>
                  <th className="px-3 py-2 text-right font-medium">Manual</th>
                </tr>
              </thead>
              <tbody>
                {visiblePages.map((p) => (
                  <tr key={p.id} className="border-t border-[#e5e5e5]">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {p.render_status === "error" && (
                          <span className="flex-none rounded-[3px] border border-[#e5e5e5] bg-[#f5f5f5] px-1.5 py-0.5 text-[10px] text-[#737373]">
                            error
                          </span>
                        )}
                        <a
                          href={`/scans/${scan.id}/inspect?page=${p.id}`}
                          className="max-w-md truncate font-medium text-black underline underline-offset-2"
                        >
                          {p.url}
                        </a>
                      </div>
                      {p.error && <div className="mt-1 text-xs text-[#737373]">{p.error}</div>}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${scoreTone(p.score)}`}>
                      {p.score ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-black">{p.issue_count}</td>
                    <td className="px-3 py-2 text-right text-[#737373]">{p.manual_review_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={safePage} pageCount={pageCount} onPage={setPage} />
        </section>
      )}
    </div>
  );
}

function SidebarSection({
  label,
  issues,
  selectedRuleId,
  onSelect,
}: {
  label: string;
  issues: IssueGroup[];
  selectedRuleId: string | null;
  onSelect: (issue: IssueGroup) => void;
}) {
  const [page, setPage] = useState(1);
  if (issues.length === 0) return null;
  const pageCount = Math.max(1, Math.ceil(issues.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = issues.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="mb-3">
      {label && (
        <div className="mb-1 px-3 text-[11px] uppercase tracking-[0.14em] text-[#737373]">
          {label} ({issues.length})
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        {visible.map((issue) => (
          <button
            key={issue.rule_id}
            onClick={() => onSelect(issue)}
            className={`flex w-full items-start gap-2 rounded-[3px] px-3 py-2 text-left text-sm transition-colors ${
              issue.rule_id === selectedRuleId
                ? "bg-black text-white"
                : "text-black hover:bg-[#f5f5f5]"
            }`}
          >
            <span className="mt-1">
              <SeverityDot impact={issue.impact} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{issue.criterion_name || issue.description}</span>
              <span
                className={`block text-xs ${
                  issue.rule_id === selectedRuleId ? "text-white/70" : "text-[#737373]"
                }`}
              >
                {issue.affected_page_count} page{issue.affected_page_count === 1 ? "" : "s"}
              </span>
            </span>
          </button>
        ))}
      </div>
      {issues.length > PAGE_SIZE && (
        <div className="mt-1 flex items-center justify-between px-3 text-xs text-[#737373]">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="underline underline-offset-2 disabled:no-underline disabled:opacity-30"
          >
            Previous
          </button>
          <span>
            {safePage} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={safePage >= pageCount}
            className="underline underline-offset-2 disabled:no-underline disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default function ScanDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [scan, setScan] = useState<ScanSummary | null>(null);
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  const [issues, setIssues] = useState<IssueGroup[] | null>(null);
  const [checks, setChecks] = useState<CheckScore[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [retesting, setRetesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      try {
        const s = await getScan(params.id);
        if (cancelled) return;
        setScan(s);
        if (IN_PROGRESS.has(s.status)) {
          timer = setTimeout(tick, 2000);
        } else if (s.status === "done") {
          const [p, i, c] = await Promise.all([
            getScanPages(params.id),
            getScanIssues(params.id),
            getScanChecks(params.id),
          ]);
          if (!cancelled) {
            setPages(p);
            setIssues(i);
            setChecks(c);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load scan");
      }
    }

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [params.id]);

  const issuesByCategory = useMemo(() => {
    const map = new Map<string, IssueGroup[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const issue of issues ?? []) {
      const cat = issue.category || "accessibility";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(issue);
    }
    return map;
  }, [issues]);

  function splitAccessibilityByLevel(catIssues: IssueGroup[], levelKey: string) {
    return catIssues.filter((issue) => {
      const key = issue.is_best_practice || !issue.wcag_level ? "bp" : issue.wcag_level;
      return key === levelKey;
    });
  }

  const selectedIssue = issues?.find((i) => i.rule_id === selectedRuleId) ?? null;

  async function handleRetest() {
    if (!scan) return;
    setRetesting(true);
    try {
      const newScan = await createScan(scan.root_url, scan.max_pages, scan.max_depth);
      router.push(`/scans/${newScan.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start retest");
      setRetesting(false);
    }
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-8 text-sm text-black">
        {error}
      </main>
    );
  }
  if (!scan) {
    return (
      <main className="min-h-screen bg-white p-8">
        <CompassLoader fullPage label="Loading…" />
      </main>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white text-black">
      <header className="flex flex-none items-center gap-4 border-b border-black bg-black px-6 py-3 text-white">
        <a href="/dashboard" className="flex-none text-xs text-white/70 underline underline-offset-2 hover:text-white">
          New scan
        </a>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{scan.root_url}</h1>
          <p className="text-xs text-white/60">
            {IN_PROGRESS.has(scan.status)
              ? `${scan.status} — ${scan.pages_crawled} scanned, ${scan.pages_queued} queued${
                  scan.pages_errored ? `, ${scan.pages_errored} errored` : ""
                }`
              : `${scan.status} · ${scan.pages_crawled} pages${
                  scan.pages_errored ? ` · ${scan.pages_errored} errored` : ""
                }`}
          </p>
        </div>
        {scan.status === "done" && scan.overall_score != null && (
          <span className="rounded-[3px] border border-white/30 px-2.5 py-1 text-xs font-semibold">
            {scan.overall_score} · {scan.overall_band}
          </span>
        )}
        {scan.status === "done" && (
          <button
            onClick={handleRetest}
            disabled={retesting}
            className="flex-none rounded-[3px] border border-white bg-white px-3 py-1.5 text-xs font-medium text-black disabled:opacity-50"
          >
            {retesting ? "Starting…" : "Retest"}
          </button>
        )}
      </header>

      {IN_PROGRESS.has(scan.status) && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <CompassLoader label="Rendering and auditing pages…" />
          <p className="text-sm text-[#737373]">
            {scan.pages_crawled} done, {scan.pages_queued} queued.
          </p>
        </div>
      )}

      {scan.status === "failed" && scan.error && (
        <p className="m-6 rounded-[3px] border border-[#e5e5e5] bg-white p-4 text-sm text-black">{scan.error}</p>
      )}

      {scan.status === "done" && issues && pages && (
        <div className="flex min-h-0 flex-1">
          <aside className="w-80 flex-none overflow-y-auto border-r border-[#e5e5e5] bg-white py-4">
            <button
              onClick={() => setSelectedRuleId(null)}
              className={`mb-4 flex w-full items-center gap-3 rounded-[3px] px-3 py-2 ${
                !selectedIssue ? "bg-[#f5f5f5]" : "hover:bg-[#f5f5f5]"
              }`}
            >
              <InspectorScoreRing score={scan.overall_score} size={48} stroke={5} />
              <span className="text-left">
                <span className="block text-sm font-semibold text-black">Overview</span>
                <span className="block text-xs text-[#737373]">
                  {issues.length} issue{issues.length === 1 ? "" : "s"}
                </span>
              </span>
            </button>

            {CATEGORY_ORDER.map((cat) => {
              const catIssues = issuesByCategory.get(cat) ?? [];
              if (catIssues.length === 0) return null;
              return (
                <div key={cat} className="mb-5">
                  <div className="mb-1.5 flex items-center justify-between px-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#737373]">
                      {CATEGORY_LABELS[cat]}
                    </span>
                    <span className={`text-xs font-semibold ${scoreTone(scan.category_scores[cat])}`}>
                      {scan.category_scores[cat] ?? "—"}
                    </span>
                  </div>
                  {cat === "accessibility" ? (
                    LEVEL_SECTIONS.map((section) => (
                      <SidebarSection
                        key={section.key}
                        label={section.label}
                        issues={splitAccessibilityByLevel(catIssues, section.key)}
                        selectedRuleId={selectedRuleId}
                        onSelect={(issue) => setSelectedRuleId(issue.rule_id)}
                      />
                    ))
                  ) : (
                    <SidebarSection
                      label=""
                      issues={catIssues}
                      selectedRuleId={selectedRuleId}
                      onSelect={(issue) => setSelectedRuleId(issue.rule_id)}
                    />
                  )}
                </div>
              );
            })}
          </aside>

          <main className="flex-1 overflow-y-auto bg-white p-8">
            <div className="mx-auto max-w-4xl">
              {selectedIssue ? (
                <div className="rounded-[3px] border border-[#e5e5e5] bg-white p-8">
                  <IssueDetail issue={selectedIssue} />
                </div>
              ) : issues.length === 0 ? (
                <p className="rounded-[3px] border border-[#e5e5e5] bg-white p-8 text-sm text-[#737373]">
                  No accessibility issues found.
                </p>
              ) : (
                <Overview scan={scan} pages={pages} checks={checks} />
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
