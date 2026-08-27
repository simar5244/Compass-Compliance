"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import {
  approveGrammar,
  ignoreGrammarRule,
  type GrammarGroup,
  type GrammarIssue,
  type GrammarSource,
} from "@/lib/api";

const SEV_COLOR: Record<string, string> = {
  error: "var(--sev-error)",
  warning: "var(--sev-warning)",
};
const GREEN = "#16a34a";

const SOURCE_BADGE: Record<GrammarSource, string | null> = {
  visible: null,
  title: "Title",
  alt_text: "Alt",
  navigation: "Nav",
};

/** Render an excerpt with the first occurrence of `needle` underlined in `color`. */
function Underlined({ text, needle, color }: { text: string; needle: string; color: string }) {
  const idx = needle ? text.indexOf(needle) : -1;
  if (idx < 0) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <span style={{ textDecoration: "underline", textDecorationColor: color, textDecorationThickness: 2, textUnderlineOffset: 3 }}>
        {needle}
      </span>
      {text.slice(idx + needle.length)}
    </span>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "error") {
    return <span className="inline-block h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: SEV_COLOR.error }} />;
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={SEV_COLOR.warning} strokeWidth="2.5" className="flex-none">
      <path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

export function GrammarIssuesTable({
  groups: groupsProp,
  siteId,
  onChanged,
  onInspect,
}: {
  groups: GrammarGroup[];
  siteId: string;
  onChanged?: () => void;
  /** Opens the inspector on the page carrying this finding, focused on it. */
  onInspect?: (issue: GrammarIssue) => void;
}) {
  const [groups, setGroups] = useState<GrammarGroup[]>(groupsProp);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  // Re-seed local state whenever the parent refetches.
  useEffect(() => setGroups(groupsProp), [groupsProp]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const dropIssues = (predicate: (i: GrammarIssue) => boolean) =>
    setGroups((gs) =>
      gs
        .map((g) => ({ ...g, issues: g.issues.filter((i) => !predicate(i)) }))
        .filter((g) => g.issues.length > 0),
    );

  async function approve(errorText: string) {
    dropIssues((i) => i.error_text === errorText); // optimistic
    setToast(`Grammar approved — “${errorText}” will no longer be flagged`);
    try {
      await approveGrammar(siteId, errorText);
    } catch {
      setToast("Couldn't approve — refreshing");
    }
    onChanged?.();
  }

  async function ignoreRule(ruleId: string) {
    dropIssues((i) => i.rule_id === ruleId); // optimistic
    setToast(`Rule ignored — “${ruleId}” hidden on all pages`);
    try {
      await ignoreGrammarRule(siteId, ruleId);
    } catch {
      setToast("Couldn't ignore — refreshing");
    }
    onChanged?.();
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[3px] border border-[#e5e5e5] bg-white px-6 py-16 text-center">
        <div className="text-2xl">✓</div>
        <div className="text-sm font-semibold text-black">No grammar issues found</div>
        <div className="text-xs text-[#737373]">
          Grammar issues will appear here once a scan completes.
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="overflow-x-auto rounded-[3px] border border-[#e5e5e5] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#fafafa]">
            <tr>
              <th className="w-8 px-3 py-2" />
              <th className="w-[52px] px-3 py-2" />
              <th className="px-3 py-2 text-left text-xs font-semibold text-[#737373]">Excerpt</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-[#737373]">Quantity</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows
                key={g.group_name}
                group={g}
                expanded={expanded}
                onToggle={toggle}
                onApprove={approve}
                onInspect={onInspect}
                onIgnoreRule={ignoreRule}
              />
            ))}
          </tbody>
        </table>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[3px] bg-black px-4 py-2 text-sm text-white" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function GroupRows({
  group,
  expanded,
  onToggle,
  onApprove,
  onIgnoreRule,
  onInspect,
}: {
  group: GrammarGroup;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onApprove: (errorText: string) => void;
  onIgnoreRule: (ruleId: string) => void;
  onInspect?: (issue: GrammarIssue) => void;
}) {
  const color = SEV_COLOR[group.severity] ?? SEV_COLOR.warning;
  return (
    <>
      <tr className="bg-[#fafafa]">
        <td colSpan={5} className="px-3 py-2">
          <div className="flex items-center gap-2" style={{ borderLeft: `3px solid ${color}`, paddingLeft: 8 }}>
            <SeverityIcon severity={group.severity} />
            <span className="text-sm font-semibold text-black">
              “{group.group_name}”
            </span>
            <span className="text-xs text-[#737373]">
              · {group.issues.length} {group.issues.length === 1 ? "issue" : "issues"}
            </span>
          </div>
        </td>
      </tr>
      {group.issues.map((issue) => {
        const isOpen = expanded.has(issue.id);
        const badge = SOURCE_BADGE[issue.source_type];
        return (
          <tr key={issue.id} className="border-t border-[#e5e5e5] align-top">
            <td className="px-3 py-3">
              <input type="checkbox" aria-label="Select issue" className="mt-0.5" />
            </td>
            <td className="px-3 py-3">
              {onInspect && (
                <button
                  type="button"
                  onClick={() => onInspect(issue)}
                  aria-label={`Inspect ${issue.error_text || issue.excerpt}`}
                  className="grid h-8 w-8 place-items-center rounded-[3px] bg-black text-white hover:bg-[#262626]"
                >
                  <Search aria-hidden className="h-4 w-4" />
                </button>
              )}
            </td>
            <td className="px-3 py-3">
              <div className="flex items-start gap-2">
                {issue.corrected_excerpt && (
                  <button
                    onClick={() => onToggle(issue.id)}
                    aria-label={isOpen ? "Collapse correction" : "Show correction"}
                    className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-[3px] border border-[#e5e5e5] text-xs font-bold leading-none text-[#737373]"
                  >
                    {isOpen ? "−" : "+"}
                  </button>
                )}
                <div className="min-w-0">
                  <div className="break-words text-black">
                    <Underlined text={issue.excerpt} needle={issue.error_text} color={color} />
                  </div>
                  {isOpen && issue.corrected_excerpt && (
                    <div className="mt-1 break-words text-[#737373]">
                      <Underlined text={issue.corrected_excerpt} needle={issue.replacement ?? ""} color={GREEN} />
                    </div>
                  )}
                  {badge && (
                    <span className="mt-1 inline-block rounded-[3px] bg-[#f5f5f5] px-1.5 py-0.5 text-[10px] font-medium text-[#737373]">
                      {badge}
                    </span>
                  )}
                </div>
              </div>
            </td>
            <td className="px-3 py-3 text-right font-semibold tabular-nums">{issue.quantity}</td>
            <td className="px-3 py-3 text-right">
              <ApproveMenu
                onApprove={() => onApprove(issue.error_text)}
                onIgnoreRule={() => onIgnoreRule(issue.rule_id)}
              />
            </td>
          </tr>
        );
      })}
    </>
  );
}

function ApproveMenu({ onApprove, onIgnoreRule }: { onApprove: () => void; onIgnoreRule: () => void }) {
  return (
    <div className="inline-flex items-stretch overflow-visible">
      <button
        onClick={onApprove}
        className="rounded-l-[3px] bg-black px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#262626]"
      >
        Approve grammar
      </button>
      <details className="relative">
        <summary
          className="flex h-full cursor-pointer list-none items-center rounded-r-[3px] border-l border-white/25 bg-black px-1.5 py-1.5 text-xs font-semibold text-white hover:bg-[#262626]"
        >
          ▾
        </summary>
        <div className="absolute right-0 z-20 mt-1 w-60 overflow-hidden rounded-[3px] border border-[#e5e5e5] bg-white py-1 text-left">
          <button
            onClick={onIgnoreRule}
            className="block w-full px-3 py-2 text-left text-xs text-black hover:bg-[#f5f5f5]"
          >
            Ignore this grammar rule for all pages
          </button>
        </div>
      </details>
    </div>
  );
}
