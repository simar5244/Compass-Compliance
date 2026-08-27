"use client";

import { Fragment, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { CATEGORY_LABELS, REPORT_CATEGORY_ORDER, type IssueOut, type PageDetail } from "@/lib/api";
import { inspectorSectionLabel } from "@/lib/report";
import { InspectorScoreRing } from "./InspectorScoreRing";
import { InspectorInfoPanel } from "./InspectorInfoPanel";
import { inspectorPageSlice, ListPager } from "./ListPager";

export type CheckSeverity = "error" | "warning" | "info" | "manual";

export interface InspectorCheckGroup {
  key: string;
  category: string;
  ruleId: string;
  displayName: string;
  severity: CheckSeverity;
  issues: IssueOut[];
  representative?: IssueOut;
}

function displayUrl(raw: string) {
  try {
    const url = new URL(raw);
    return `${url.host}${url.pathname}${url.search}`;
  } catch {
    return raw;
  }
}

function SeverityIcon({ severity }: { severity: CheckSeverity }) {
  if (severity === "manual") {
    return (
      <span
        aria-hidden
        className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-[3px] border border-[#525252] bg-white text-[11px] font-bold leading-none text-[#525252]"
      >
        i
      </span>
    );
  }
  if (severity === "error") {
    return <span aria-hidden className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-[3px] bg-black text-[13px] font-bold leading-none text-white">!</span>;
  }
  if (severity === "warning") {
    return (
      <span aria-hidden className="relative inline-block h-5 w-5 flex-none text-[#737373]">
        <span className="absolute -top-[5px] left-0 text-[25px] leading-none">▲</span>
        <span className="absolute left-[8px] top-[2px] text-[11px] font-bold leading-none text-white">!</span>
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex h-[19px] w-[19px] flex-none items-center justify-center rounded-[3px] bg-[#a3a3a3] text-[12px] font-bold text-white"
    >
      !
    </span>
  );
}

type InspectorPage = PageDetail & { title?: string | null };

export function InspectorSidebar({
  page,
  grouped,
  searchQuery,
  onSearchChange,
  selectedCheckKey,
  onSelectCheck,
  collapsedCategories,
  onToggleCategory,
  activeTab,
  onTabChange,
  hasUsableBBox,
  detailPanel,
  width,
}: {
  page: InspectorPage;
  grouped: Map<string, InspectorCheckGroup[]>;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedCheckKey: string | null;
  onSelectCheck: (check: InspectorCheckGroup) => void;
  collapsedCategories: Set<string>;
  onToggleCategory: (category: string) => void;
  activeTab: "issues" | "info";
  onTabChange: (tab: "issues" | "info") => void;
  hasUsableBBox: (issue: IssueOut) => boolean;
  detailPanel?: React.ReactNode;
  /** Pixel width, controlled by the inspector's drag handle. */
  width: number;
}) {
  const [listPage, setListPage] = useState<Record<string, number>>({});
  const [viewAllCats, setViewAllCats] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setListPage({});
    setViewAllCats({});
  }, [searchQuery]);
  const categories = REPORT_CATEGORY_ORDER.filter((category) => grouped.has(category));
  const fallbackCategories = [...grouped.keys()].filter(
    (category) => !REPORT_CATEGORY_ORDER.includes(category as (typeof REPORT_CATEGORY_ORDER)[number]),
  );
  const orderedCategories = [...categories, ...fallbackCategories];
  const categoryScores = page.category_scores ?? {};

  return (
    <aside
      className="flex h-full flex-none flex-col overflow-hidden border-r border-[#e5e5e5] bg-[#f5f5f5]"
      style={{ width }}
      aria-label="Page inspector sidebar"
    >
      {!(activeTab === "issues" && detailPanel) && <div className="px-3 pb-3 pt-3">
        <div className="flex items-center gap-3">
          <InspectorScoreRing score={page.score} size={60} stroke={4} />
          <div>
            <div className="text-[21px] font-semibold leading-6 text-black">Overall</div>
            <div className="text-[13px] leading-5 text-[#737373]">Score for this page</div>
          </div>
        </div>

        <label className="relative mt-4 block">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#737373]"
          />
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search"
            aria-label="Search checks"
            className="h-[37px] w-full rounded-[3px] border border-[#e5e5e5] bg-white pl-8 pr-3 text-[14px] text-black outline-none placeholder:text-[#a3a3a3] focus:border-black"
          />
        </label>
      </div>}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === "issues" ? (
          detailPanel ? detailPanel : <div className="px-[7px] pb-6 pt-3">
            {orderedCategories.map((category) => {
              const checks = grouped.get(category);
              if (!checks) return null;
              const collapsed = collapsedCategories.has(category);
              const categoryLabel = CATEGORY_LABELS[category] ?? category;
              const categoryScore = categoryScores[categoryLabel] ?? categoryScores[category] ?? null;
              const viewAll = viewAllCats[category] ?? false;
              const { page, pageCount, slice: visibleChecks } = viewAll
                ? { page: 0, pageCount: 1, slice: checks }
                : inspectorPageSlice(checks, listPage[category] ?? 0);

              return (
                <section key={category} className="mb-7">
                  <button
                    type="button"
                    onClick={() => onToggleCategory(category)}
                    className="flex w-full items-center px-[10px] pb-[9px] pt-0 text-left"
                    aria-expanded={!collapsed}
                    aria-label={categoryLabel}
                  >
                    <span className="flex-1 text-[19px] font-semibold leading-6 text-black">
                      {categoryLabel}
                    </span>
                    {categoryScore != null && (
                      <span className="flex items-center gap-[6px] text-[16px] font-semibold text-black">
                        <InspectorScoreRing score={categoryScore} size={25} stroke={3} showValue={false} />
                        <span>{Math.round(categoryScore)}<span className="align-top text-[10px]">%</span></span>
                      </span>
                    )}
                  </button>

                  {!collapsed && (
                    <div>
                      <div className="overflow-hidden rounded-[3px] border border-[#e5e5e5] bg-white py-[3px]">
                      {visibleChecks.map((check) => (
                        <Fragment key={check.key}>
                        {inspectorSectionLabel(category, check.ruleId) && (
                          <div className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-[#737373]">
                            {inspectorSectionLabel(category, check.ruleId)}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => onSelectCheck(check)}
                          aria-label={check.displayName}
                          className={`flex min-h-[54px] w-full items-start gap-3 px-[10px] py-[10px] text-left transition-colors ${
                            check.key === selectedCheckKey
                              ? "bg-[#f5f5f5]"
                              : "hover:bg-[#fafafa]"
                          }`}
                        >
                          <span className="mt-[2px]"><SeverityIcon severity={check.severity} /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14px] font-semibold leading-[20px] text-black">
                              {check.displayName}
                            </span>
                          </span>
                        </button>
                        </Fragment>
                      ))}
                      </div>
                      <ListPager
                        page={page}
                        pageCount={pageCount}
                        onPage={(next) => setListPage((previous) => ({ ...previous, [category]: next }))}
                        label={`${categoryLabel} issues`}
                        viewAll={viewAll}
                        onViewAllChange={(next) => setViewAllCats((previous) => ({ ...previous, [category]: next }))}
                        totalItems={checks.length}
                      />
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <InspectorInfoPanel page={page} />
        )}
      </div>

      <div className="grid h-[41px] flex-none grid-cols-2 bg-black">
        {(["issues", "info"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`px-3 text-[13px] font-semibold capitalize text-white ${
              activeTab === tab
                ? "bg-[#262626]"
                : "bg-black hover:bg-[#171717]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
    </aside>
  );
}
