"use client";

export const INSPECTOR_LIST_PAGE_SIZE = 10;

export function inspectorPageCount(length: number, size = INSPECTOR_LIST_PAGE_SIZE) {
  return Math.max(1, Math.ceil(Math.max(0, length) / size));
}

export function inspectorPageSlice<T>(items: T[], page: number, size = INSPECTOR_LIST_PAGE_SIZE) {
  const pageCount = inspectorPageCount(items.length, size);
  const safe = Math.min(Math.max(0, page), pageCount - 1);
  return { page: safe, pageCount, slice: items.slice(safe * size, safe * size + size) };
}

export function ListPager({
  page,
  pageCount,
  onPage,
  label,
  viewAll = false,
  onViewAllChange,
  totalItems,
}: {
  page: number;
  pageCount: number;
  onPage: (next: number) => void;
  label: string;
  viewAll?: boolean;
  onViewAllChange?: (viewAll: boolean) => void;
  totalItems?: number;
}) {
  const canExpand = totalItems != null && onViewAllChange && totalItems > INSPECTOR_LIST_PAGE_SIZE;

  if (viewAll && canExpand) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3 py-2 text-[13px]">
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

  if (pageCount <= 1 && !canExpand) return null;

  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-center gap-2 py-2">
      {pageCount > 1 && Array.from({ length: pageCount }, (_, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onPage(index)}
          aria-current={index === page ? "page" : undefined}
          className={`h-8 min-w-8 rounded-[3px] px-2 text-[13px] font-medium ${
            index === page ? "bg-black text-white" : "text-black hover:bg-[#f5f5f5]"
          }`}
        >
          {index + 1}
        </button>
      ))}
      {canExpand && (
        <button
          type="button"
          onClick={() => onViewAllChange(true)}
          className="h-8 rounded-[3px] px-3 text-[13px] font-semibold text-black underline"
        >
          View all
        </button>
      )}
    </nav>
  );
}
