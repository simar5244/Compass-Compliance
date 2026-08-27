"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  getSiteChecksFull,
  getSitePages,
  getWebVitals,
  type SiteCheckRow,
  type SitePageRow,
  type VitalsExperience,
  type WebVitals,
} from "@/lib/auth";
import { InspectorScoreRing } from "@/components/inspector/InspectorScoreRing";
import { MultiLineChart } from "@/components/platform/site/overview/OverviewPrimitives";
import { ModuleCheckTable } from "@/components/platform/site/ModuleCheckList";
import { VitalGauge, type VitalBands } from "@/components/platform/site/vitals/VitalGauge";

const TABS = ["Experiences", "Pages", "Checks"] as const;
type TabKey = (typeof TABS)[number];

/** Google's thresholds, in each vital's own unit. */
const LCP_BANDS: VitalBands = { good: 2500, poor: 4000, max: 8000 };
const FID_BANDS: VitalBands = { good: 100, poor: 300, max: 600 };
const CLS_BANDS: VitalBands = { good: 0.1, poor: 0.25, max: 0.5 };

function seconds(ms: number | null): string {
  return ms == null ? "—" : `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)}s`;
}

export default function WebVitalsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const requestKey = params.id;
  const [tab, setTab] = useState<TabKey>("Experiences");
  const [loaded, setLoaded] = useState<{
    key: string;
    vitals: WebVitals | null;
    pages: SitePageRow[] | null;
    scanId: string | null;
    checks: SiteCheckRow[] | null;
    error: string | null;
  }>({ key: "", vitals: null, pages: null, scanId: null, checks: null, error: null });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getWebVitals(params.id),
      getSitePages(params.id),
      getSiteChecksFull(params.id, "ux"),
    ])
      .then(([vitals, pages, checks]) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey,
            vitals,
            pages: pages.pages,
            scanId: pages.scan_id,
            checks: checks.checks.filter((check) => check.subcategory === "Web Vitals"),
            error: null,
          });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey, vitals: null, pages: null, scanId: null, checks: null,
            error: e instanceof Error ? e.message : "Failed to load web vitals",
          });
        }
      });
    return () => { cancelled = true; };
  }, [params.id, requestKey]);

  const fresh = loaded.key === requestKey ? loaded : null;
  const vitals = fresh?.vitals ?? null;
  const error = fresh?.error ?? null;

  if (error) {
    return (
      <div className="light-theme p-8 text-sm text-[#737373]">
        {error.includes("404") ? "No completed scan yet." : error}
      </div>
    );
  }
  if (!vitals) return <CompassLoader fullPage label="Loading web vitals…" />;

  return (
    <div className="light-theme px-6 py-6 text-black">
      <h1 className="text-[28px] font-semibold leading-8 tracking-tight text-black">Web Vitals</h1>
      <p className="mt-2 max-w-[72ch] text-[14px] leading-6 text-[#525252]">
        Measure standard quality signals for a great user experience on the web. Web Vitals are an
        SEO ranking indicator used by Google.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <section className="rounded-[3px] border border-[#e5e5e5] bg-white">
          <h2 className="border-b border-[#e5e5e5] px-4 py-3 text-[13px] font-semibold tracking-tight text-black">
            Score
          </h2>
          <div className="flex flex-col items-center px-4 py-8">
            <InspectorScoreRing score={vitals.score} size={96} stroke={8} />
            {vitals.delta != null && vitals.delta !== 0 && (
              <p className="mt-3 text-[12px] font-medium text-black">
                {vitals.delta > 0 ? "↑ Up" : "↓ Down"} {Math.abs(vitals.delta).toFixed(2)}%
              </p>
            )}
            {vitals.delta === 0 && (
              <p className="mt-3 text-[12px] text-[#737373]">No change since the last run</p>
            )}
          </div>
        </section>

        <section className="rounded-[3px] border border-[#e5e5e5] bg-white p-4">
          <h2 className="mb-3 text-[13px] font-semibold tracking-tight text-black">Vitals over time</h2>
          <MultiLineChart
            points={vitals.history}
            series={[{ key: "score", label: "Web Vitals", color: "#171717" }]}
            ariaLabel="Web Vitals score over time"
          />
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <GaugeCard
          title="Largest Contentful Paint"
          reading={seconds(vitals.metrics.largest_contentful_paint_ms)}
          caption="Measures perceived load speed"
          value={vitals.metrics.largest_contentful_paint_ms}
          bands={LCP_BANDS}
        />
        <GaugeCard
          title="First Input Delay"
          reading={seconds(vitals.metrics.first_input_delay_ms)}
          caption="Measures responsiveness of pages"
          value={vitals.metrics.first_input_delay_ms}
          bands={FID_BANDS}
          note="Lab estimate of the worst first interaction; true FID needs real visitors."
        />
        <GaugeCard
          title="Cumulative Layout Shift"
          reading={
            vitals.metrics.cumulative_layout_shift == null
              ? "—"
              : vitals.metrics.cumulative_layout_shift.toFixed(2)
          }
          caption="Measures changes to layout when loading"
          value={vitals.metrics.cumulative_layout_shift}
          bands={CLS_BANDS}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-[3px] border border-[#e5e5e5] bg-white">
        <div className="flex border-b border-[#e5e5e5]">
          {TABS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTab(option)}
              aria-current={option === tab ? "page" : undefined}
              className={`px-5 py-3 text-[13px] font-medium ${
                option === tab
                  ? "border-b-2 border-black text-black"
                  : "text-[#737373] hover:text-black"
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {tab === "Experiences" && <ExperiencesTab experiences={vitals.experiences} />}

        {tab === "Pages" && (
          <PagesTab
            pages={fresh?.pages ?? []}
            onInspect={(pageId) => {
              if (fresh?.scanId) router.push(`/scans/${fresh.scanId}/inspect?page=${pageId}`);
            }}
          />
        )}

        {tab === "Checks" && <ModuleCheckTable checks={fresh?.checks ?? []} />}
      </div>
    </div>
  );
}

function GaugeCard({
  title,
  reading,
  caption,
  value,
  bands,
  note,
}: {
  title: string;
  reading: string;
  caption: string;
  value: number | null;
  bands: VitalBands;
  note?: string;
}) {
  return (
    <section className="rounded-[3px] border border-[#e5e5e5] bg-white">
      <h2 className="border-b border-[#e5e5e5] px-4 py-3 text-[13px] font-semibold tracking-tight text-black">
        {title}
      </h2>
      <div className="px-4 pb-5 pt-3">
        <VitalGauge value={value} bands={bands} label={`${title}: ${reading}`} />
        <p className="mt-1 text-center text-[22px] font-semibold tracking-tight text-black">{reading}</p>
        <p className="mt-1 text-center text-[12px] text-[#525252]">{caption}</p>
        {note && <p className="mt-2 text-center text-[11px] text-[#737373]">{note}</p>}
      </div>
    </section>
  );
}

/** One row per emulated visitor, with the loading filmstrip it produced. */
function ExperiencesTab({ experiences }: { experiences: VitalsExperience[] }) {
  if (experiences.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-[#737373]">
        No experiences measured yet — they are captured on the next scan.
      </p>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-2 px-4 py-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-black">Experiences</h2>
        <span className="rounded-[3px] bg-[#f5f5f5] px-2 py-0.5 text-[12px] font-medium text-[#525252]">
          {experiences.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-t border-[#e5e5e5] text-left">
          <thead>
            <tr className="bg-[#fafafa] text-[12px] text-[#737373]">
              <th scope="col" className="w-[190px] px-4 py-2.5 font-medium">Experience</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Frames</th>
              <th scope="col" className="w-[90px] px-3 py-2.5 text-right font-medium">LCP</th>
              <th scope="col" className="w-[100px] py-2.5 pl-3 pr-4 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {experiences.map((experience) => (
              <tr key={experience.form_factor} className="border-t border-[#e5e5e5] align-top">
                <td className="px-4 py-3">
                  <div className="text-[14px] font-medium text-black">Homepage</div>
                  <div className="mt-0.5 text-[12px] text-[#737373]">{experience.device}</div>
                  <div className="text-[12px] text-[#737373]">{experience.connection}</div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex gap-px">
                    {experience.frames.map((frame, index) => (
                      <figure key={index} className="w-[92px] flex-none border border-[#e5e5e5]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={frame.data}
                          alt={`Frame at ${((frame.timing_ms ?? 0) / 1000).toFixed(1)} seconds`}
                          className="h-[104px] w-full bg-white object-cover object-top"
                        />
                        <figcaption className="bg-[#f5f5f5] py-1 text-center text-[11px] text-[#525252]">
                          {((frame.timing_ms ?? 0) / 1000).toFixed(1)} s
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3 text-right text-[13px] tabular-nums text-[#525252]">
                  {seconds(experience.largest_contentful_paint_ms)}
                </td>
                <td className="py-3 pl-3 pr-4">
                  <div className="flex justify-end">
                    <InspectorScoreRing score={experience.score} size={44} stroke={4} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PagesTab({
  pages,
  onInspect,
}: {
  pages: SitePageRow[];
  onInspect: (pageId: string) => void;
}) {
  if (pages.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-[#737373]">No pages in the latest scan.</p>;
  }
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="bg-[#fafafa] text-[12px] text-[#737373]">
          <th scope="col" className="px-4 py-2.5 font-medium">Page</th>
          <th scope="col" className="w-[110px] py-2.5 pl-3 pr-4 text-right font-medium">Score</th>
        </tr>
      </thead>
      <tbody>
        {pages.slice(0, 50).map((page) => (
          <tr key={page.page_id} className="border-t border-[#e5e5e5]">
            <td className="max-w-0 truncate px-4 py-3">
              <button
                type="button"
                onClick={() => onInspect(page.page_id)}
                className="block max-w-full truncate text-[14px] text-black underline underline-offset-2 hover:text-[#525252]"
                title={page.url}
              >
                {page.title || page.url}
              </button>
            </td>
            <td className="py-3 pl-3 pr-4 text-right text-[13px] tabular-nums text-[#525252]">
              {page.score ?? "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
