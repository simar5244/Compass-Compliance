"use client";

import { Search } from "lucide-react";

export type AffectedPage = {
  page_id: string;
  page_url: string;
  count: number;
  /** A finding on that page, so the inspector can open focused on it. */
  issue_id?: string;
};

/**
 * The "Pages" tab shared by the individual check screens: which pages this
 * check found something on, worst first, each linking into the inspector.
 */
export function AffectedPagesTab({
  pages,
  countLabel,
  onInspect,
}: {
  pages: AffectedPage[];
  /** Header for the per-page tally, e.g. "Words" or "Broken links". */
  countLabel: string;
  onInspect: (page: AffectedPage) => void;
}) {
  if (pages.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-[#6b7280]">No affected pages.</p>;
  }

  return (
    <table className="w-full text-left">
      <thead>
        <tr className="bg-[#fafbfc] text-[13px] text-[#5b626b]">
          <th scope="col" className="w-[52px]" />
          <th scope="col" className="px-3 py-3 font-medium">Page</th>
          <th scope="col" className="w-[140px] py-3 pl-3 pr-5 text-right font-medium">{countLabel}</th>
        </tr>
      </thead>
      <tbody>
        {pages.map((page) => (
          <tr key={page.page_id} className="border-t border-[#eceff3]">
            <td className="py-3 pl-5">
              <button
                type="button"
                onClick={() => onInspect(page)}
                aria-label={`Inspect ${page.page_url}`}
                className="grid h-8 w-8 place-items-center rounded-[4px] bg-[#4436d6] text-white hover:bg-[#3a2dc0]"
              >
                <Search aria-hidden className="h-4 w-4" />
              </button>
            </td>
            <td className="max-w-0 truncate px-3 py-3">
              <button
                type="button"
                onClick={() => onInspect(page)}
                className="block max-w-full truncate text-[14px] text-[#3D2FD6] underline"
                title={page.page_url}
              >
                {page.page_url}
              </button>
            </td>
            <td className="py-3 pl-3 pr-5 text-right text-[14px] text-[#3f4650]">{page.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Roll a list of per-finding page references up into one row per page. */
export function rollUpPages(
  refs: readonly { page_id: string; page_url: string; issue_id?: string }[],
): AffectedPage[] {
  const byPage = new Map<string, AffectedPage>();
  for (const ref of refs) {
    const existing = byPage.get(ref.page_id);
    if (existing) existing.count += 1;
    else {
      byPage.set(ref.page_id, {
        page_id: ref.page_id,
        page_url: ref.page_url,
        count: 1,
        issue_id: ref.issue_id,
      });
    }
  }
  return [...byPage.values()].sort((a, b) => b.count - a.count || a.page_url.localeCompare(b.page_url));
}
