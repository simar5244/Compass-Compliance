"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

/** Small accessible modal: role=dialog, Esc + backdrop close, focus-trapped. */
export function Modal({ open, onClose, title, children, width = "28rem" }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement;
    const panel = panelRef.current;
    const items = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    items()[0]?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const f = items(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); openerRef.current?.focus?.(); };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 backdrop-blur-[2px]" style={{ backgroundColor: "rgba(0,0,0,.45)" }} onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title}
        className="relative w-full overflow-hidden rounded-[3px] border border-[#e5e5e5] bg-white text-black"
        style={{ maxWidth: width }}>
        <div className="flex items-center justify-between border-b border-[#e5e5e5] px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-[3px] p-1 text-[#737373] hover:bg-[#f5f5f5]">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export const fieldCls = "w-full rounded-[3px] border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-black outline-none transition-colors focus:border-black";
export const fieldStyle = { borderColor: "#e5e5e5", backgroundColor: "#fafafa", color: "#000000" } as const;
