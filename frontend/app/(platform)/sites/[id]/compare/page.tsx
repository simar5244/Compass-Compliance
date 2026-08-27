"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { compareRuns, type CompareResult } from "@/lib/auth";
import { CATEGORY_LABEL, CATEGORY_ORDER, DeltaChip, SCORED_CATEGORIES } from "@/components/platform/ui";

export default function ComparePage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const a = search.get("a") ?? "";
  const b = search.get("b") ?? "";
  const [data, setData] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(true);

  useEffect(() => {
    if (!a || !b) {
      setError("Select two runs to compare.");
      return;
    }
    compareRuns(params.id, a, b)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [params.id, a, b]);

  if (error) {
    return (
      <div className="light-theme bg-white px-6 py-10 text-black lg:px-12">
        <p className="text-sm text-[#525252]">{error}</p>
      </div>
    );
  }
  if (!data) return <CompassLoader fullPage label="Loading comparison…" />;

  const rows: { key: string; label: string }[] = [
    { key: "overall", label: "Overall" },
    ...CATEGORY_ORDER.filter((c) => SCORED_CATEGORIES.has(c)).map((c) => ({
      key: c,
      label: CATEGORY_LABEL[c] ?? c,
    })),
  ];

  const list = showNew ? data.issues_new_list : data.issues_resolved_list;

  return (
    <div className="light-theme bg-white text-black">
      <section className="border-b border-[#e5e5e5] px-6 py-8 lg:px-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => router.push(`/sites/${params.id}`)}
            className="inline-flex items-center gap-1.5 text-sm text-[#525252] hover:text-black"
          >
            Back to site
          </button>
          <button
            type="button"
            onClick={() => router.replace(`/sites/${params.id}/compare?a=${b}&b=${a}`)}
            className="inline-flex items-center gap-2 rounded-[3px] border border-black px-4 py-2 text-sm font-medium hover:bg-[#f5f5f5]"
          >
            <ArrowLeftRight size={14} aria-hidden />
            Swap runs
          </button>
        </div>
        <p className="mt-8 text-[11px] uppercase tracking-[0.18em] text-[#737373]">Run comparison</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight lg:text-5xl">Score change</h1>
        <p className="mt-3 text-sm text-[#525252]">
          {new Date(data.run_a.started_at).toLocaleDateString()} → {new Date(data.run_b.started_at).toLocaleDateString()}
        </p>
      </section>

      <section className="px-6 py-8 lg:px-12">
        <div className="overflow-hidden rounded-[3px] border border-[#e5e5e5]">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 bg-[#fafafa] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#737373]">
            <span>Category</span>
            <span className="w-20 text-right">{new Date(data.run_a.started_at).toLocaleDateString()}</span>
            <span className="w-20 text-right">{new Date(data.run_b.started_at).toLocaleDateString()}</span>
            <span className="w-16 text-right">Change</span>
          </div>
          {rows.map((r) => {
            const av = r.key === "overall" ? data.run_a.overall_score : data.summary.category_deltas[r.key]?.score_a;
            const bv = r.key === "overall" ? data.run_b.overall_score : data.summary.category_deltas[r.key]?.score_b;
            const delta = r.key === "overall" ? data.summary.overall_delta : data.summary.category_deltas[r.key]?.delta;
            return (
              <div
                key={r.key}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-t border-[#e5e5e5] px-4 py-3 text-sm"
              >
                <span className={r.key === "overall" ? "font-semibold" : ""}>{r.label}</span>
                <span className="w-20 text-right tabular-nums text-[#525252]">{av ?? "—"}</span>
                <span className="w-20 text-right font-semibold tabular-nums">{bv ?? "—"}</span>
                <span className="w-16 text-right">
                  <DeltaChip delta={delta} />
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { n: data.summary.issues_new, label: `New issues (${data.total_new})` },
            { n: data.summary.issues_resolved, label: "Resolved" },
            { n: data.summary.issues_unchanged, label: "Unchanged" },
          ].map((t) => (
            <div key={t.label} className="rounded-[3px] border border-[#e5e5e5] bg-white p-5 text-center">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">{t.label}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{t.n}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[#e5e5e5] px-6 py-8 lg:px-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Pages</p>
        <h2 className="mt-2 mb-4 text-2xl font-semibold tracking-tight">Per-page score change</h2>
        <div className="overflow-x-auto rounded-[3px] border border-[#e5e5e5]">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[#737373]">
              <tr>
                <th className="px-4 py-2.5">Page</th>
                <th className="px-4 py-2.5 text-right">A</th>
                <th className="px-4 py-2.5 text-right">B</th>
                <th className="px-4 py-2.5 text-right">Δ</th>
                <th className="px-4 py-2.5">Content</th>
              </tr>
            </thead>
            <tbody>
              {data.pages.map((p) => (
                <tr key={p.url} className="border-t border-[#e5e5e5]">
                  <td className="max-w-md truncate px-4 py-2.5">{p.url}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#525252]">{p.score_a ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.score_b ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <DeltaChip delta={p.score_delta} />
                  </td>
                  <td className="px-4 py-2.5">
                    {p.is_new_page
                      ? "new"
                      : p.is_removed_page
                        ? "removed"
                        : p.content_changed
                          ? (
                              <span className="rounded-[3px] bg-[#f5f5f5] px-2 py-0.5 text-xs font-medium text-[#525252]">
                                changed
                              </span>
                            )
                          : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-t border-[#e5e5e5] px-6 py-8 lg:px-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Issues</p>
        <h2 className="mt-2 mb-4 text-2xl font-semibold tracking-tight">New and resolved</h2>
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className={`rounded-[3px] px-3 py-1.5 text-sm font-medium ${
              showNew ? "bg-black text-white" : "border border-[#e5e5e5] text-black hover:bg-[#fafafa]"
            }`}
          >
            New ({data.total_new})
          </button>
          <button
            type="button"
            onClick={() => setShowNew(false)}
            className={`rounded-[3px] px-3 py-1.5 text-sm font-medium ${
              !showNew ? "bg-black text-white" : "border border-[#e5e5e5] text-black hover:bg-[#fafafa]"
            }`}
          >
            Resolved ({data.total_resolved})
          </button>
        </div>
        <div className="rounded-[3px] border border-[#e5e5e5]">
          {list.map((iss, i) => (
            <div
              key={i}
              className="flex items-center gap-2 border-t border-[#e5e5e5] px-4 py-2.5 text-sm first:border-t-0"
            >
              <span className="truncate">{iss.display_name}</span>
              <span className="ml-auto shrink-0 text-xs text-[#737373]">
                {iss.page_url.replace(/^https?:\/\//, "")}
              </span>
            </div>
          ))}
          {list.length === 0 && <div className="px-4 py-6 text-sm text-[#737373]">None.</div>}
        </div>
      </section>
    </div>
  );
}
