"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { getSite, getSiteChecksFull, getSiteIssues, type SiteIssue, type SiteDetail } from "@/lib/auth";
import { bandLabel } from "@/components/platform/ui";

const PAGE_SIZE = 10;
const APPROVED = ["#CC0000", "#8E001C", "#000000", "#FFFFFF", "#FF6B6B"];

const AREAS = [
  { label: "Colors", rule: "brand_unapproved_colors", href: "colors" },
  { label: "Typography", rule: "brand_unapproved_fonts", href: "typography" },
  { label: "Logo", rule: "brand_logo_present", href: "logo" },
  { label: "Buttons", rule: "brand_button_consistency", href: "buttons" },
] as const;

function snippet(issue: SiteIssue) {
  try {
    return JSON.parse(issue.html_snippet || "{}");
  } catch {
    return {};
  }
}

function Swatch({ color }: { color: string }) {
  return (
    <span className="inline-flex flex-col items-center gap-1.5">
      <span
        title={color}
        className="inline-block size-9 rounded-[3px] border border-[#e5e5e5]"
        style={{ backgroundColor: color }}
      />
      <span className="font-mono text-[10px] uppercase tracking-wide text-[#737373]">{color}</span>
    </span>
  );
}

export default function BrandStandardsOverview() {
  const { id } = useParams<{ id: string }>();
  const [site, setSite] = useState<SiteDetail | null>(null);
  const [issues, setIssues] = useState<SiteIssue[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [colorPage, setColorPage] = useState(1);

  useEffect(() => {
    Promise.all([getSite(id), getSiteIssues(id, "Brand Standards"), getSiteChecksFull(id, "brand-standards")])
      .then(([s, i]) => {
        setSite(s);
        setIssues(i.issues);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [id]);

  const score = site?.category_scores?.["Brand Standards"] ?? 100;
  const colors = useMemo(
    () =>
      issues
        .filter((i) => i.rule_id === "brand_unapproved_colors")
        .flatMap((i) => snippet(i).violations || [])
        .map((v: { detected_color: string }) => v.detected_color),
    [issues],
  );
  const uniqueDetected = [...new Set(colors)];
  const cms = issues.find((i) => i.rule_id === "brand_cms_detected");
  const cmsName = cms ? snippet(cms).cms_detected : null;
  const reviewCount = AREAS.filter((area) => issues.some((i) => i.rule_id === area.rule)).length;
  const [lead, ...rest] = AREAS;

  const colorPageCount = Math.max(1, Math.ceil(uniqueDetected.length / PAGE_SIZE));
  const safeColorPage = Math.min(colorPage, colorPageCount);
  const visibleColors = uniqueDetected.slice(
    (safeColorPage - 1) * PAGE_SIZE,
    (safeColorPage - 1) * PAGE_SIZE + PAGE_SIZE,
  );

  if (!loaded) return <CompassLoader fullPage label="Loading Brand Standards overview…" />;

  return (
    <div className="light-theme bg-white text-black">
      <section className="grid gap-10 border-b border-[#e5e5e5] px-6 py-10 lg:grid-cols-[1.2fr_0.8fr] lg:px-12 lg:py-14">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Brand Standards</p>
          <h1 className="mt-3 max-w-[14ch] text-[40px] font-semibold leading-[0.92] tracking-[-0.05em] lg:text-[56px]">
            Visual identity
          </h1>
          <p className="mt-5 max-w-[48ch] text-sm leading-6 text-[#525252]">
            TTU checks for color, typography, logos, and components against the approved palette and
            usage rules.
          </p>
        </div>
        <div className="flex min-h-[180px] flex-col justify-between rounded-[3px] bg-black p-6 text-white">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">{bandLabel(score)}</p>
          <div>
            <p className="text-[40px] font-semibold leading-none tracking-[-0.05em]">{Math.round(score)}</p>
            <p className="mt-2 text-sm text-white/60">Score</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 px-6 py-8 sm:grid-cols-2 lg:px-12">
        <div className="rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-6">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Areas</p>
          <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.05em]">{AREAS.length}</p>
        </div>
        <div className="rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-6">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Need review</p>
          <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.05em]">{reviewCount}</p>
        </div>
      </section>

      {cmsName && (
        <div className="px-6 pb-8 lg:px-12">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] px-5 py-4">
            <p className="text-sm text-[#525252]">
              <span className="font-semibold text-black">{cmsName} detected.</span> Brand fixes can be
              made directly in the CMS.
            </p>
            <span className="text-sm font-medium text-black">View CMS instructions →</span>
          </div>
        </div>
      )}

      <section className="px-6 pb-10 lg:px-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Checks</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Identity surfaces</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
          {lead && (
            <Link
              href={`/sites/${id}/brand-standards/${lead.href}`}
              className="group flex min-h-[220px] flex-col justify-between rounded-[3px] bg-black p-6 text-white lg:min-h-[240px]"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-semibold">{lead.label}</h3>
                <ArrowUpRight aria-hidden className="h-4 w-4 text-white/60 group-hover:text-white" />
              </div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/60">
                {issues.some((i) => i.rule_id === lead.rule) ? "Review needed" : "Passed"}
              </p>
            </Link>
          )}
          {rest.map((area) => {
            const needsReview = issues.some((i) => i.rule_id === area.rule);
            return (
              <Link
                key={area.rule}
                href={`/sites/${id}/brand-standards/${area.href}`}
                className="group flex min-h-[220px] flex-col justify-between rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-6 hover:border-black lg:min-h-[240px]"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[15px] font-semibold">{area.label}</h3>
                  <ArrowUpRight aria-hidden className="h-4 w-4 text-[#737373] group-hover:text-black" />
                </div>
                <p
                  className={`text-[11px] font-medium uppercase tracking-[0.14em] ${
                    needsReview ? "text-black" : "text-[#737373]"
                  }`}
                >
                  {needsReview ? "Review needed" : "Passed"}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="border-t border-[#e5e5e5] px-6 py-10 lg:px-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Palette</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Detected colors vs approved TTU palette</h2>
        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          <div className="rounded-[3px] border border-[#e5e5e5] bg-white p-5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Detected</p>
            <div className="mt-4 flex flex-wrap gap-4">
              {uniqueDetected.length ? (
                visibleColors.map((c) => <Swatch key={c} color={c} />)
              ) : (
                <p className="text-sm text-[#737373]">No unapproved colors reported.</p>
              )}
            </div>
            {uniqueDetected.length > PAGE_SIZE && (
              <div className="mt-4 flex items-center justify-end gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setColorPage((p) => Math.max(1, p - 1))}
                  disabled={safeColorPage <= 1}
                  className="grid size-9 place-items-center border border-[#e5e5e5] disabled:opacity-30"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="min-w-[7rem] text-center text-[#525252]">
                  Page {safeColorPage} of {colorPageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setColorPage((p) => Math.min(colorPageCount, p + 1))}
                  disabled={safeColorPage >= colorPageCount}
                  className="grid size-9 place-items-center border border-[#e5e5e5] disabled:opacity-30"
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
          <div className="rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Approved</p>
            <div className="mt-4 flex flex-wrap gap-4">
              {APPROVED.map((c) => (
                <Swatch key={c} color={c} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
