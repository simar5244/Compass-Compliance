"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { changePassword, logout, type Me } from "@/lib/auth";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

/** Right-side profile panel. Accessible: role=dialog, aria-modal, focus-trapped,
 * closes on Esc / outside click, and restores focus to the opener. */
export function ProfileDrawer({ user, open, onClose }: { user: Me; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement;
    const panel = panelRef.current;
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    focusables()[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0], last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      openerRef.current?.focus?.();
    };
  }, [open, onClose]);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (next.length < 6) return setPwMsg({ ok: false, text: "New password must be at least 6 characters." });
    if (next !== confirm) return setPwMsg({ ok: false, text: "New passwords do not match." });
    try {
      await changePassword(cur, next);
      setPwMsg({ ok: true, text: "Password updated." });
      setCur(""); setNext(""); setConfirm("");
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : "Could not update password." });
    }
  }

  async function doLogout() {
    try { await logout(); } catch { /* ignore */ }
    router.replace("/login");
  }

  if (!open) return null;

  const initials = (user.name || user.email).slice(0, 2).toUpperCase();
  const inputCls = "w-full rounded-[3px] border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-black outline-none transition-colors focus:border-black";

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      {/* backdrop — outside click closes */}
      <div className="absolute inset-0 backdrop-blur-[2px]" style={{ backgroundColor: "rgba(0,0,0,.4)" }} onClick={onClose} data-testid="drawer-backdrop" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Profile menu"
        className="absolute right-0 top-0 flex h-full w-[22rem] max-w-[92vw] flex-col overflow-y-auto border-l border-[#e5e5e5] bg-white text-black"
      >
        {/* Header */}
        <div className="relative border-b border-[#e5e5e5] bg-black px-5 pb-5 pt-6">
          <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-[3px] p-1.5 text-white/80 hover:bg-white/15">✕</button>
          <div className="flex items-center gap-3">
            <span className="grid h-14 w-14 flex-none place-items-center rounded-[3px] bg-white text-lg font-bold text-black">
              {initials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-white">{user.name || user.email}</div>
              <div className="truncate text-xs text-white/80">{user.email}</div>
              <span className="mt-1 inline-block rounded-[3px] bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                {user.role === "admin" ? "Admin" : "User"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-5 p-5">
          {/* Change password */}
          <section className="rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#737373]">Change password</div>
            <form onSubmit={submitPassword} className="flex flex-col gap-2">
              <input type="password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} className={inputCls} />
              <input type="password" placeholder="New password" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} />
              <input type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
              {pwMsg && <p className="text-xs font-medium" style={{ color: pwMsg.ok ? "#16a34a" : "#dc2626" }}>{pwMsg.text}</p>}
              <button type="submit" className="mt-1 rounded-[3px] bg-black py-2 text-sm font-semibold text-white hover:bg-[#262626]">
                Update password
              </button>
            </form>
          </section>

          {user.role === "admin" && (
            <button onClick={() => { onClose(); router.push("/admin"); }}
              className="flex items-center justify-between rounded-[3px] border border-[#e5e5e5] px-4 py-3 text-sm font-medium hover:bg-[#f5f5f5]">
              <span>Manage users &amp; sites</span>
              <span aria-hidden className="text-black">→</span>
            </button>
          )}

          <button onClick={doLogout} className="mt-auto flex items-center justify-center gap-2 rounded-[3px] border border-[#e5e5e5] py-2.5 text-sm font-semibold text-black hover:bg-[#f5f5f5]">
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
