"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import type { IssueOut } from "@/lib/api";
import { firstPayloadText, parseIssuePayload, relevantSnippet } from "./issueDetail";
import { inspectorPageSlice, ListPager, INSPECTOR_LIST_PAGE_SIZE } from "./ListPager";

function instanceHeading(issue: IssueOut, index: number) {
  const payload = parseIssuePayload(issue.html_snippet);
  if (issue.rule_id.toLowerCase().includes("broken")) {
    return firstPayloadText(payload, ["url"]) || `Broken link ${index + 1}`;
  }
  if (issue.rule_id === "spelling") {
    return firstPayloadText(payload, ["word", "error_text", "text", "token"]) || `Spelling instance ${index + 1}`;
  }
  if (issue.rule_id === "grammar") {
    return firstPayloadText(payload, ["error_text", "message", "text"]) || `Grammar instance ${index + 1}`;
  }
  if (issue.rule_id === "sensitive_keywords") {
    return firstPayloadText(payload, ["matched_text", "error_text"]) || `Keyword ${index + 1}`;
  }
  return issue.selector || `Instance ${index + 1}`;
}

export function GroupedInstanceList({
  issues,
  selectedId,
  onSelect,
  onIgnore,
  onAskAI,
}: {
  issues: IssueOut[];
  selectedId: string;
  onSelect: (issue: IssueOut) => void;
  onIgnore: (issue: IssueOut) => void;
  onAskAI?: (issue: IssueOut) => void;
}) {
  /**
   * Selecting is a toggle elsewhere in the inspector, which would make a second
   * click on the open instance clear its highlight. In a list of instances that
   * reads as the highlight breaking, so re-picking the open one is a no-op.
   */
  const show = (issue: IssueOut) => {
    if (issue.id !== selectedId) onSelect(issue);
  };

  const [page, setPage] = useState(0);
  const [viewAll, setViewAll] = useState(false);
  useEffect(() => {
    const index = issues.findIndex((issue) => issue.id === selectedId);
    if (index >= 0) setPage(Math.floor(index / INSPECTOR_LIST_PAGE_SIZE));
    // Sync when the selected instance changes, not when the parent rebuilds the array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    setViewAll(false);
    setPage(0);
  }, [issues.length]);

  const { page: safePage, pageCount, slice } = viewAll
    ? { page: 0, pageCount: 1, slice: issues }
    : inspectorPageSlice(issues, page);

  return (
    <section className="mb-4" aria-label={`${issues.length} issue instances`}>
      <div className="mb-2 text-xs font-semibold text-black">
        Instances ({issues.length})
      </div>
      <div className="space-y-2">
        {slice.map((issue, index) => {
          const payload = parseIssuePayload(issue.html_snippet);
          const anchorText = firstPayloadText(payload, ["anchor_text"]);
          const replacement = firstPayloadText(payload, ["replacement", "suggestion", "corrected_text"]);
          const snippet = relevantSnippet(issue);
          const status = payload?.http_status;
          const isSelected = issue.id === selectedId;
          const absoluteIndex = safePage * INSPECTOR_LIST_PAGE_SIZE + index;

          return (
            <article
              key={issue.id}
              // Selecting scrolls the screenshot to this instance and outlines
              // it, so the whole card is the target rather than the small link
              // that used to be the only way to do it.
              onClick={() => show(issue)}
              className={`rounded-[3px] border p-3 ${issue.bbox ? "cursor-pointer" : ""}`}
              style={{
                borderColor: isSelected ? "#000000" : "#e5e5e5",
                backgroundColor: isSelected ? "#f5f5f5" : "#ffffff",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); show(issue); }}
                  aria-current={isSelected ? "true" : undefined}
                  className="min-w-0 flex-1 break-words text-left text-xs font-semibold text-black"
                >
                  {instanceHeading(issue, absoluteIndex)}
                </button>
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); onIgnore(issue); }}
                  className="inline-flex flex-none items-center gap-1 rounded-[3px] border border-[#e5e5e5] bg-white px-2 py-1 text-[11px] font-medium text-[#737373] transition-colors hover:border-black hover:bg-[#f5f5f5] hover:text-black"
                  aria-label={`Ignore instance ${absoluteIndex + 1}`}
                >
                  <X aria-hidden className="h-3 w-3" />
                  Ignore
                </button>
              </div>

              {typeof status === "number" && (
                <div className="mt-1 text-[11px] text-[#737373]">HTTP {status}</div>
              )}
              {anchorText && (
                <div className="mt-1 text-[11px] text-[#737373]">Link text: “{anchorText}”</div>
              )}
              {replacement && (
                <div className="mt-1 text-[11px] text-[#737373]">Suggested: {replacement}</div>
              )}
              {issue.selector && (
                <div className="mt-2 break-all text-[11px] text-[#737373]">
                  Selector: <code>{issue.selector}</code>
                </div>
              )}
              {snippet && (
                <pre className="mt-2 max-h-28 w-full min-w-0 overflow-x-auto overflow-y-auto whitespace-pre rounded-[3px] bg-[#f5f5f5] p-2 font-mono text-[10px] text-black">
                  <code className="whitespace-pre">{snippet}</code>
                </pre>
              )}
              {issue.bbox ? (
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); show(issue); }}
                  className="mt-2 text-[11px] font-medium text-black underline"
                >
                  View this instance on page
                </button>
              ) : (
                // Without coordinates there is nothing to outline, and silence
                // would read as the highlight being broken.
                <div className="mt-2 text-[11px] text-[#737373]">
                  No position recorded for this instance
                </div>
              )}
              {issue.rule_id === "sensitive_keywords" && isSelected && onAskAI && (
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); onAskAI(issue); }}
                  className="ml-3 mt-2 rounded-[3px] bg-black px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#262626]"
                  aria-label={`Ask AI about ${instanceHeading(issue, absoluteIndex)}`}
                >
                  ✦ Ask AI
                </button>
              )}
            </article>
          );
        })}
      </div>
      <ListPager
        page={safePage}
        pageCount={pageCount}
        onPage={setPage}
        label="Issue instances"
        viewAll={viewAll}
        onViewAllChange={setViewAll}
        totalItems={issues.length}
      />
    </section>
  );
}
