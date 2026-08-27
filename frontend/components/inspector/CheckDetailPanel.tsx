"use client";

import { useMemo, useState } from "react";
import type { IssueOut } from "@/lib/api";
import { InstanceAccordion } from "./InstanceAccordion";
import { buildInstances, type InspectorInstance } from "./instances";

const DESCRIPTION_CLAMP = 150;

function wcagText(issue: IssueOut): string | null {
  if (!issue.criterion_id) return null;
  return ["WCAG", issue.wcag_version, issue.wcag_level, issue.criterion_id].filter(Boolean).join(" ");
}

/**
 * Render inline markup and backticked terms as code chips so check descriptions can
 * teach with real examples. Plain descriptions pass through untouched.
 */
function RichDescription({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|<\/?[a-zA-Z][^<>]*>)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        const isBackticked = part.startsWith("`") && part.endsWith("`");
        const isTag = /^<\/?[a-zA-Z]/.test(part);
        if (!isBackticked && !isTag) return <span key={index}>{part}</span>;
        return (
          <code
            key={index}
            className="rounded-[3px] bg-[#f5f5f5] px-[3px] font-mono text-[13px] text-black"
          >
            {isBackticked ? part.slice(1, -1) : part}
          </code>
        );
      })}
    </>
  );
}

export function CheckDetailPanel({
  issue,
  ruleId,
  displayName,
  instances,
  pageUrl,
  pageThumbnailUrl,
  onSelectInstance,
  onAskAIInstance,
  onBack,
}: {
  /** The representative finding, or null for a check that passed on this page. */
  issue: IssueOut | null;
  /** Identifies the check when there is no finding to read it from. */
  ruleId: string;
  displayName?: string;
  /** Every issue row for the selected check, in engine order. */
  instances: IssueOut[];
  pageUrl: string;
  pageThumbnailUrl: string | null;
  onSelectInstance: (issue: IssueOut) => void;
  onAskAIInstance: (issue: IssueOut) => void;
  onBack?: () => void;
}) {
  const [expandedDescription, setExpandedDescription] = useState(false);
  // Tracked against the check it belongs to, so opening a different check falls back
  // to its own first row instead of carrying the previous selection across.
  const [expanded, setExpanded] = useState<{ check: string; key: string | null }>({ check: "", key: null });

  const rows = useMemo(() => buildInstances(instances, pageUrl), [instances, pageUrl]);

  const checkKey = `${issue?.category ?? ""}:${ruleId}`;
  // Opening a check expands its first instance, so the body and Ask AI are there
  // straight away rather than hidden behind an extra click.
  const expandedKey = expanded.check === checkKey ? expanded.key : rows[0]?.key ?? null;

  const title = displayName || issue?.display_name || issue?.description || ruleId;
  const criterion = issue ? wcagText(issue) : null;
  const description = issue ? issue.check_description || issue.remediation : "";
  const needsClamp = description.length > DESCRIPTION_CLAMP;
  const shown = needsClamp && !expandedDescription
    ? `${description.slice(0, DESCRIPTION_CLAMP).trimEnd()}… `
    : `${description} `;

  function toggleRow(instance: InspectorInstance) {
    const next = instance.key === expandedKey ? null : instance.key;
    setExpanded({ check: checkKey, key: next });
    if (next) onSelectInstance(instance.occurrences[0]);
  }

  return (
    <section className="min-h-full w-full" role="complementary" aria-label="Issue details">
      <div className="px-3 pb-4 pt-3">
        <div className="mb-2 flex items-start gap-[10px]">
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-[3px] border border-[#e5e5e5] bg-white text-[22px] leading-none text-black"
            aria-label="Back to all issues"
          >
            ‹
          </button>
          <h2 className="pr-1 text-[20px] font-semibold leading-[26px] text-black">{title}</h2>
        </div>

        {criterion && (
          <div className="mb-2 pl-[42px] text-[14px] font-semibold text-[#525252]">{criterion}</div>
        )}

        {description && <p className="text-[14px] leading-[22px] text-[#525252]">
          <RichDescription text={shown} />
          {needsClamp && (
            <button
              type="button"
              onClick={() => setExpandedDescription((previous) => !previous)}
              className="text-black underline"
            >
              {expandedDescription ? "Show less" : "Show more"}
            </button>
          )}
        </p>}
      </div>

      <div className="border-t-2 border-black" />
      <div className="bg-white py-[10px] text-center text-[15px] font-medium text-black">Issues</div>

      {rows.length === 0 ? (
        <p className="bg-white px-4 py-6 text-center text-[13px] leading-5 text-[#525252]">
          No issues found for this check on this page.
        </p>
      ) : (
      <InstanceAccordion
        instances={rows}
        expandedKey={expandedKey}
        onToggle={toggleRow}
        onSelectOccurrence={onSelectInstance}
        onAskAI={onAskAIInstance}
        pageThumbnailUrl={pageThumbnailUrl}
      />
      )}
    </section>
  );
}
