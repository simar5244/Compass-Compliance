"use client";

import { useEffect, useState } from "react";
import type { IssueOut } from "@/lib/api";
import { formatHtml } from "@/lib/formatHtml";
import type { InspectorInstance } from "./instances";
import { inspectorPageSlice, ListPager, INSPECTOR_LIST_PAGE_SIZE } from "./ListPager";

function AskAIButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="mx-auto my-3 flex items-center gap-2 rounded-[3px] bg-black px-4 py-[7px] text-[13px] font-semibold text-white hover:bg-[#333]"
    >
      <span aria-hidden className="text-white">✦</span>
      Ask AI
    </button>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span
      aria-label={`${count} occurrences`}
      className="ml-auto flex h-[26px] min-w-[26px] flex-none items-center justify-center rounded-[3px] bg-[#f5f5f5] px-2 text-[13px] font-semibold text-[#525252]"
    >
      {count}
    </span>
  );
}

function OccurrencePager({
  index,
  total,
  onChange,
}: {
  index: number;
  total: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-[#e5e5e5] px-2 py-2">
      <button
        type="button"
        onClick={() => onChange(index - 1)}
        disabled={index <= 0}
        aria-label="Previous occurrence"
        className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#e5e5e5] bg-white text-[18px] leading-none text-black disabled:opacity-40"
      >
        ‹
      </button>
      <span className="text-[13px] font-medium text-[#525252]">
        {index + 1} of {total}
      </span>
      <button
        type="button"
        onClick={() => onChange(index + 1)}
        disabled={index >= total - 1}
        aria-label="Next occurrence"
        className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#e5e5e5] bg-white text-[18px] leading-none text-black disabled:opacity-40"
      >
        ›
      </button>
    </div>
  );
}

function InstanceBody({
  instance,
  pageThumbnailUrl,
  occurrenceIndex,
  onOccurrenceChange,
  onAskAI,
}: {
  instance: InspectorInstance;
  pageThumbnailUrl: string | null;
  occurrenceIndex: number;
  onOccurrenceChange: (next: number) => void;
  onAskAI: (issue: IssueOut) => void;
}) {
  const total = instance.occurrences.length;
  const current = instance.occurrences[Math.min(occurrenceIndex, total - 1)] ?? instance.issue;

  return (
    <div className="bg-[#f5f5f5] px-3 pb-1 pt-3">
      {instance.kind === "media" && instance.imageUrl && (
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={instance.imageUrl}
            alt={instance.label}
            className="max-h-[72px] max-w-[72px] rounded-[3px] border border-[#e5e5e5] bg-white object-contain p-1"
          />
          <a
            href={instance.imageUrl}
            target="_blank"
            rel="noreferrer"
            className="break-all text-center text-[13px] text-black underline"
          >
            {instance.label}
          </a>
        </div>
      )}

      {instance.kind === "page" && pageThumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pageThumbnailUrl}
          alt="Rendered page preview"
          data-testid="page-thumbnail"
          className="mx-auto max-h-[300px] w-full rounded-[3px] border border-[#e5e5e5] bg-white object-cover object-top"
        />
      )}

      {instance.kind === "element" && instance.snippet && (
        <pre className="max-h-40 w-full min-w-0 overflow-x-auto overflow-y-auto whitespace-pre rounded-[3px] border border-[#e5e5e5] bg-white p-3 font-mono text-[12px] leading-5 text-black">
          <code className="whitespace-pre">{formatHtml(instance.snippet)}</code>
        </pre>
      )}

      {instance.message && (
        <p className="mt-3 text-center text-[13px] leading-5 text-[#525252]">{instance.message}</p>
      )}

      <AskAIButton onClick={() => onAskAI(current)} label={`Ask AI about ${instance.label}`} />

      {total > 1 && (
        <OccurrencePager index={Math.min(occurrenceIndex, total - 1)} total={total} onChange={onOccurrenceChange} />
      )}
    </div>
  );
}

/** The Silktide-style instance list: collapsed rows that expand one at a time. */
export function InstanceAccordion({
  instances,
  expandedKey,
  onToggle,
  onSelectOccurrence,
  onAskAI,
  pageThumbnailUrl,
}: {
  instances: InspectorInstance[];
  expandedKey: string | null;
  onToggle: (instance: InspectorInstance) => void;
  onSelectOccurrence: (issue: IssueOut) => void;
  onAskAI: (issue: IssueOut) => void;
  pageThumbnailUrl: string | null;
}) {
  // Paging is tracked per row, so opening a different row restarts at its first
  // occurrence without needing an effect to reset it.
  const [pager, setPager] = useState<{ key: string | null; index: number }>({ key: null, index: 0 });
  const [page, setPage] = useState(0);
  const [viewAll, setViewAll] = useState(false);
  const occurrenceIndex = pager.key === expandedKey ? pager.index : 0;

  useEffect(() => {
    if (!expandedKey) return;
    const index = instances.findIndex((instance) => instance.key === expandedKey);
    if (index >= 0) setPage(Math.floor(index / INSPECTOR_LIST_PAGE_SIZE));
    // Jump to the expanded row's page when the selection changes, not when the
    // parent rebuilds the instance array (that would pin the reader to page 1).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedKey]);

  useEffect(() => {
    setViewAll(false);
    setPage(0);
  }, [instances.length]);

  const { page: safePage, pageCount, slice } = viewAll
    ? { page: 0, pageCount: 1, slice: instances }
    : inspectorPageSlice(instances, page);

  return (
    <section aria-label={`${instances.length} issue instances`}>
      {slice.map((instance) => {
        const expanded = instance.key === expandedKey;
        const count = instance.occurrences.length;

        return (
          <div key={instance.key} className="border-b border-[#e5e5e5]">
            <button
              type="button"
              onClick={() => onToggle(instance)}
              aria-expanded={expanded}
              aria-label={instance.label}
              className={`flex w-full items-center gap-2 px-2 py-[11px] text-left ${
                expanded ? "bg-black text-white" : "bg-white text-black hover:bg-[#f5f5f5]"
              }`}
            >
              <span aria-hidden className="flex-none text-[15px] leading-none">
                {instance.kind === "page" ? "✓" : expanded ? "⌄" : "›"}
              </span>

              {instance.kind === "media" && instance.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={instance.imageUrl}
                  alt=""
                  className="h-7 w-7 flex-none rounded-[3px] border border-[#e5e5e5] bg-white object-contain p-[2px]"
                />
              )}

              <span
                className={`min-w-0 flex-1 truncate underline ${
                  instance.labelIsCode ? "font-mono text-[12px]" : "text-[13px]"
                }`}
                title={instance.label}
              >
                {instance.label}
              </span>

              {count > 1 && <CountBadge count={count} />}
            </button>

            {expanded && (
              <InstanceBody
                instance={instance}
                pageThumbnailUrl={pageThumbnailUrl}
                occurrenceIndex={occurrenceIndex}
                onOccurrenceChange={(next) => {
                  setPager({ key: instance.key, index: next });
                  const issue = instance.occurrences[next];
                  if (issue) onSelectOccurrence(issue);
                }}
                onAskAI={onAskAI}
              />
            )}
          </div>
        );
      })}
      <ListPager
        page={safePage}
        pageCount={pageCount}
        onPage={setPage}
        label="Issue instances"
        viewAll={viewAll}
        onViewAllChange={setViewAll}
        totalItems={instances.length}
      />
    </section>
  );
}
