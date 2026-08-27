"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createInstantScan, normalizeWebsiteUrl } from "@/lib/api";

const CHECK_AREAS = [
  "Accessibility",
  "Content",
  "Privacy",
  "Policies",
  "Marketing",
  "User experience",
] as const;

export default function InspectEntryPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { slug } = await createInstantScan(normalizeWebsiteUrl(url));
      router.push(`/r/${slug}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start scan";
      setError(message.includes("429") ? "You've run a lot of scans recently — please wait a bit and try again." : message);
      setSubmitting(false);
    }
  }

  return (
    <div className="light-theme min-h-[calc(100vh-3.5rem)] bg-white text-black">
      <section className="grid gap-10 px-6 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-stretch lg:px-12 lg:py-16">
        <div className="flex flex-col justify-center">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Instant scan</p>
          <h1 className="mt-4 max-w-[9ch] text-[48px] font-semibold leading-[0.92] tracking-[-0.05em] lg:text-[72px]">
            Inspect a page
          </h1>
          <p className="mt-6 max-w-md text-sm leading-6 text-[#525252]">
            Paste a URL. Compass runs accessibility, content, privacy, policies, marketing, and user-experience checks on that page.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col justify-between rounded-[3px] bg-black p-7 text-white lg:p-8"
        >
          <div>
            <label htmlFor="inspect-url" className="text-[11px] uppercase tracking-[0.18em] text-white/50">
              Page URL
            </label>
            <input
              id="inspect-url"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              required
              placeholder="https://example.com"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className="mt-3 h-12 w-full rounded-[3px] border border-white/20 bg-white px-3 text-sm text-black outline-none placeholder:text-[#737373] focus:border-white"
            />
            <p className="mt-2 text-xs text-white/45">Only the URL is required.</p>
            {error && (
              <p className="mt-4 rounded-[3px] border border-white/25 px-3 py-2 text-sm text-white" role="alert">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-8 h-12 w-full rounded-[3px] bg-white text-sm font-semibold text-black hover:bg-[#f5f5f5] disabled:opacity-50"
          >
            {submitting ? "Starting inspection…" : "Inspect this page"}
          </button>
        </form>
      </section>

      <section className="border-t border-[#e5e5e5] px-6 py-10 lg:px-12" aria-label="Check areas">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">What this scan covers</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CHECK_AREAS.map((label, index) => (
            <li
              key={label}
              className={`flex min-h-[140px] flex-col justify-between rounded-[3px] p-5 ${
                index === 0
                  ? "bg-black text-white"
                  : "border border-[#e5e5e5] bg-[#fafafa] text-black"
              }`}
            >
              <p className={`text-[11px] tabular-nums tracking-[0.12em] ${index === 0 ? "text-white/45" : "text-[#737373]"}`}>
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className="text-lg font-semibold tracking-tight">{label}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
