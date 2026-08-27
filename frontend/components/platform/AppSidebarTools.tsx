"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScanSearch, Search } from "lucide-react";

/** Global search + instant inspect — lives in the left rail, not the top bar. */
export function AppSidebarTools({
  expanded,
  onRequestExpand,
}: {
  expanded: boolean;
  onRequestExpand?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `/dashboard?q=${encodeURIComponent(q)}` : "/dashboard");
  }

  function openSearch() {
    if (!expanded && onRequestExpand) {
      onRequestExpand();
      return;
    }
    if (!expanded) router.push("/dashboard");
  }

  if (!expanded) {
    return (
      <div className="shrink-0 border-t border-white/15">
        <button
          type="button"
          onClick={openSearch}
          className="flex h-10 w-[72px] items-center justify-center text-white/70 hover:bg-white/10 hover:text-white"
          aria-label="Search websites"
        >
          <Search aria-hidden size={18} />
        </button>
        <button
          type="button"
          onClick={() => router.push("/inspect")}
          className="flex h-10 w-[72px] items-center justify-center text-white/70 hover:bg-white/10 hover:text-white"
          aria-label="Inspect a page (instant scan)"
        >
          <ScanSearch aria-hidden size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-white/15 px-3 py-3">
      <form onSubmit={submitSearch} className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search websites"
          placeholder="Search"
          className="h-9 w-full rounded-[3px] border border-[#404040] bg-white pl-8 pr-2 text-sm text-black outline-none focus:border-white"
        />
      </form>
      <button
        type="button"
        onClick={() => router.push("/inspect")}
        className="mt-2 flex w-full items-center gap-2 rounded-[3px] px-2 py-2 text-[13px] font-medium text-white/70 hover:bg-white/10 hover:text-white"
        aria-label="Inspect a page (instant scan)"
      >
        <ScanSearch aria-hidden size={18} />
        Inspect
      </button>
    </div>
  );
}
