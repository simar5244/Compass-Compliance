"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function useListPagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const [viewAll, setViewAll] = useState(false);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = viewAll
    ? items
    : items.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
    setViewAll(false);
  }, [items.length]);

  return {
    page: safePage,
    setPage,
    viewAll,
    setViewAll,
    pageCount,
    visible,
    showPager: items.length > pageSize,
  };
}

export function ListPagination({
  page,
  pageCount,
  onPage,
  viewAll,
  onViewAllChange,
  totalItems,
  className = "",
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  viewAll: boolean;
  onViewAllChange: (viewAll: boolean) => void;
  totalItems: number;
  className?: string;
}) {
  if (viewAll) {
    return (
      <div className={`flex flex-wrap items-center justify-end gap-3 text-sm ${className}`}>
        <span className="text-[#525252]">Showing all {totalItems}</span>
        <button
          type="button"
          onClick={() => onViewAllChange(false)}
          className="font-semibold text-black underline"
        >
          Show less
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center justify-end gap-3 text-sm ${className}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="grid size-9 place-items-center rounded-[3px] border border-[#e5e5e5] disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-[7rem] text-center text-[#525252]">
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPage(Math.min(pageCount, page + 1))}
          disabled={page >= pageCount}
          className="grid size-9 place-items-center rounded-[3px] border border-[#e5e5e5] disabled:opacity-30"
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <button
        type="button"
        onClick={() => onViewAllChange(true)}
        className="font-semibold text-black underline"
      >
        View all
      </button>
    </div>
  );
}
