"use client";

import { useState } from "react";
import { adminCreateSite } from "@/lib/auth";
import { fieldCls, fieldStyle } from "@/components/platform/Modal";

/** Shared "add a monitored site" form (used by Admin and the Dashboard). */
export function AddSiteForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await adminCreateSite(url.trim(), name.trim() || url.trim());
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not add site");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#737373]">
        Site name
        <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 ${fieldCls}`} style={fieldStyle} placeholder="My Website" />
      </label>
      <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#737373]">
        URL
        <input value={url} onChange={(e) => setUrl(e.target.value)} required className={`mt-1 ${fieldCls}`} style={fieldStyle} placeholder="https://www.example.com" />
      </label>
      {err && <p className="text-xs text-[#525252]">{err}</p>}
      <p className="text-xs text-[#737373]">An initial scan starts automatically, and the site is recrawled on schedule.</p>
      <button type="submit" disabled={busy} className="mt-1 rounded-[3px] bg-black py-2 text-sm font-semibold text-white hover:bg-[#525252] disabled:opacity-60">
        {busy ? "Adding…" : "Add & scan"}
      </button>
    </form>
  );
}
