"use client";

import { IssueAIPanel } from "@/components/IssueAIPanel";
import { CATEGORY_LABELS, type IssueOut } from "@/lib/api";
import { GroupedInstanceList } from "./GroupedInstanceList";
import type { CheckSeverity } from "./InspectorSidebar";
import { firstPayloadText, parseIssuePayload, relevantSnippet, severityPresentation } from "./issueDetail";

function wcagText(issue: IssueOut) {
  if (!issue.criterion_id) return null;
  return ["WCAG", issue.wcag_version, issue.wcag_level, issue.criterion_id]
    .filter(Boolean)
    .join(" ");
}

function BrokenLinkDetails({ issue }: { issue: IssueOut }) {
  if (!issue.rule_id.toLowerCase().includes("broken")) return null;
  const payload = parseIssuePayload(issue.html_snippet);
  const url = firstPayloadText(payload, ["url"]);
  const anchorText = firstPayloadText(payload, ["anchor_text"]);
  const rawStatus = payload?.http_status;
  const status = typeof rawStatus === "number" ? rawStatus : null;
  const explanations: Record<number, string> = {
    400: "Bad request",
    403: "Forbidden",
    404: "Page not found",
    405: "Method not allowed",
    410: "Gone",
    429: "Too many requests",
    500: "Server error",
    999: "Blocked by the destination server",
  };
  const mayBeFalsePositive = status === 403 || status === 429 || status === 999;

  return (
    <section className="mb-4 space-y-3" aria-label="Broken link details">
      {url && (
        <div className="rounded-[3px] border border-[#e5e5e5] bg-white p-3">
          <div className="text-[11px] font-semibold text-[#737373]">Broken URL</div>
          <div className="mt-1 break-all text-xs text-black">{url}</div>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs font-medium text-black underline"
          >
            Open in new tab ↗
          </a>
        </div>
      )}
      {anchorText && (
        <div className="text-xs text-[#737373]">
          <span className="font-semibold text-black">Link text:</span> {anchorText}
        </div>
      )}
      {status != null && (
        <div className="text-xs text-[#737373]">
          <span className="font-semibold text-black">HTTP {status}</span>
          {explanations[status] ? ` · ${explanations[status]}` : ""}
        </div>
      )}
      {mayBeFalsePositive && (
        <div className="rounded-[3px] bg-[#f5f5f5] p-2 text-xs text-[#525252]">
          This may be a false positive because some sites block automated link checks. Verify it in a browser.
        </div>
      )}
    </section>
  );
}

export function InspectorDetailPanel({
  issue,
  displayName,
  instances,
  severity,
  aiOpen,
  onSelectInstance,
  onAskAIInstance,
  onReview,
  onIgnore,
  onToggleAI,
  onCloseAI,
  embedded = false,
  onBack,
}: {
  issue: IssueOut;
  displayName?: string;
  instances: IssueOut[];
  severity: CheckSeverity;
  aiOpen: boolean;
  onSelectInstance: (issue: IssueOut) => void;
  onAskAIInstance?: (issue: IssueOut) => void;
  onReview: (issue: IssueOut) => void;
  onIgnore: (issue: IssueOut) => void;
  onToggleAI: () => void;
  onCloseAI: () => void;
  embedded?: boolean;
  onBack?: () => void;
}) {
  const payload = parseIssuePayload(issue.html_snippet);
  const contextualRemediation = (() => {
    const action = firstPayloadText(payload, ["recommended_action"]);
    const instructions = firstPayloadText(payload, ["fix_instructions"]);
    if (instructions) return instructions;
    if (action && issue.rule_id === "sb17_context_aware") {
      return `${action}. Contact generalcounsel@ttu.edu for guidance.`;
    }
    return null;
  })();
  const severityBadge = severityPresentation(issue, severity);
  const category = CATEGORY_LABELS[issue.category] ?? issue.category;
  const criterion = wcagText(issue);
  const snippet = relevantSnippet(issue);

  return (
    <section
      className={embedded
        ? "relative flex min-h-full w-full flex-col bg-[#f5f5f5] px-[7px] pb-4 pt-3"
        : "w-96 flex-none overflow-y-auto border-l border-[#e5e5e5] bg-white p-5"}
      role="complementary"
      aria-label="Issue details"
    >
      {embedded && (
        <div className="mb-3 flex items-start gap-[10px]">
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-[3px] border border-[#e5e5e5] bg-white text-[22px] leading-none text-black"
            aria-label="Back to all issues"
          >
            ‹
          </button>
          <h2 className="pr-1 text-[20px] font-semibold leading-[22px] text-black">
            {displayName || issue.display_name || issue.description}
          </h2>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: severityBadge.color }}>
          <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: severityBadge.color }} />
          {severityBadge.label}
        </span>
        {issue.manual_review && (
          <span className="rounded-[3px] bg-[#f5f5f5] px-2 py-0.5 text-[11px] font-medium text-[#737373]">
            Manual review
          </span>
        )}
      </div>

      {!embedded && <h2 className="text-lg font-bold leading-6 text-black">
        {displayName || issue.display_name || issue.description}
      </h2>}
      <div className="mt-1 text-xs text-[#737373]">
        {category}{issue.subcategory ? ` · ${issue.subcategory}` : ""}
      </div>
      {!issue.bbox && (
        <div className="mt-2 text-[11px] text-[#737373]">This issue affects the whole page</div>
      )}
      {criterion && (
        <div className="mt-2 inline-flex rounded-[3px] bg-[#f5f5f5] px-2 py-1 text-[11px] text-[#525252]">
          {criterion}
        </div>
      )}

      <section className={embedded ? "my-4 border-t border-black pt-4" : "my-4 rounded-[3px] bg-[#f5f5f5] p-3"} aria-labelledby="how-to-fix-heading">
        <h3 id="how-to-fix-heading" className="mb-1 text-xs font-semibold text-black">How to fix</h3>
        <p className="text-sm leading-5 text-black">
          {contextualRemediation || issue.check_description || issue.remediation}
        </p>
      </section>

      <BrokenLinkDetails issue={issue} />

      {instances.length > 1 && (
        <GroupedInstanceList
          issues={instances}
          selectedId={issue.id}
          onSelect={onSelectInstance}
          onIgnore={onIgnore}
          onAskAI={onAskAIInstance}
        />
      )}

      {issue.selector && (
        <div className="mb-3 break-all text-xs text-[#737373]">
          <span className="font-semibold text-black">Selector:</span>{" "}
          <code>{issue.selector}</code>
        </div>
      )}
      {snippet && (
        <pre className="mb-4 max-h-40 w-full min-w-0 overflow-x-auto overflow-y-auto whitespace-pre rounded-[3px] bg-[#f5f5f5] p-3 font-mono text-[11px] text-black">
          <code className="whitespace-pre">{snippet}</code>
        </pre>
      )}

      <div className="space-y-2">
        {issue.manual_review && (
          <button
            type="button"
            onClick={() => onReview(issue)}
            disabled={issue.reviewed}
            aria-pressed={issue.reviewed}
            className="w-full rounded-[3px] border border-[#e5e5e5] px-3 py-2 text-xs font-semibold text-black disabled:opacity-60"
          >
            Mark as reviewed
          </button>
        )}
        <button
          type="button"
          onClick={() => onIgnore(issue)}
          className="w-full rounded-[3px] border border-[#e5e5e5] px-3 py-2 text-xs font-semibold text-black"
        >
          Ignore this issue
        </button>
      </div>

      {embedded && !aiOpen && (
        <div className="sticky bottom-3 z-10 mt-auto flex justify-end px-1 pt-4">
          <button
            type="button"
            onClick={onToggleAI}
            className="flex h-10 w-10 items-center justify-center rounded-[3px] border border-black bg-black text-[15px] text-white shadow-sm hover:bg-[#262626]"
            aria-label="Ask AI about this issue"
            title="Ask AI"
          >
            ✦
          </button>
        </div>
      )}

      {!embedded && (
        <button
          type="button"
          onClick={onToggleAI}
          className="w-full rounded-[3px] bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-[#262626]"
        >
          ✦ Ask AI about this issue
        </button>
      )}

      {aiOpen && (
        <div className={embedded ? "mt-3 flex-none" : "sticky bottom-0 z-10 pt-2"}>
          <IssueAIPanel issue={issue} inline onClose={onCloseAI} />
        </div>
      )}
    </section>
  );
}
