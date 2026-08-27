"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Search, Check } from "lucide-react";

import { getPrivacyForms, ignoreIssues, type PrivacyForm } from "@/lib/auth";
import { rollUpPages, type AffectedPage } from "@/components/platform/site/AffectedPagesTab";

const TABS = ["Issues", "Pages"] as const;
type TabKey = (typeof TABS)[number];

const INTRO =
  "Some form fields have the potential to collect personally identifiable information. These fields " +
  "should be reviewed to ensure they comply with GDPR. The same form usually appears on many pages — " +
  "a search box in the header, a sign-up in the footer — so identical forms are listed once with the " +
  "number of pages they appear on. Approving a form marks it reviewed and removes it from this list.";

export default function PrivacyFormsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const requestKey = params.id;
  const [tab, setTab] = useState<TabKey>("Issues");
  const [loaded, setLoaded] = useState<{
    key: string;
    scanId: string | null;
    forms: PrivacyForm[] | null;
    error: string | null;
  }>({ key: "", scanId: null, forms: null, error: null });
  const [approved, setApproved] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    getPrivacyForms(params.id)
      .then((r) => { if (!cancelled) setLoaded({ key: requestKey, scanId: r.scan_id, forms: r.forms, error: null }); })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey, scanId: null, forms: null,
            error: e instanceof Error ? e.message : "Failed to load forms",
          });
        }
      });
    return () => { cancelled = true; };
  }, [params.id, requestKey]);

  const fresh = loaded.key === requestKey ? loaded : null;
  const forms = useMemo(
    () => (fresh?.forms ?? []).filter((form) => !approved.has(form.signature)),
    [fresh, approved],
  );
  const error = fresh?.error ?? null;

  const affectedPages = useMemo(
    () =>
      rollUpPages(
        forms.flatMap((form) =>
          form.pages.map((page, index) => ({ ...page, issue_id: form.issue_ids[index] })),
        ),
      ),
    [forms],
  );

  async function approveForm(form: PrivacyForm) {
    setApproved((previous) => new Set(previous).add(form.signature));
    try {
      await ignoreIssues(params.id, form.issue_ids);
    } catch {
      setApproved((previous) => {
        const next = new Set(previous);
        next.delete(form.signature);
        return next;
      });
    }
  }

  function inspectForm(form: PrivacyForm) {
    const target = form.pages[0];
    if (!fresh?.scanId || !target) return;
    const from = `/sites/${params.id}/privacy/forms`;
    const issue = form.issue_ids[0] ? `&issue=${form.issue_ids[0]}` : "";
    router.push(`/scans/${fresh.scanId}/inspect?page=${target.page_id}${issue}&from=${encodeURIComponent(from)}`);
  }

  function inspectPage(page: AffectedPage) {
    if (!fresh?.scanId) return;
    const from = `/sites/${params.id}/privacy/forms`;
    const issue = page.issue_id ? `&issue=${page.issue_id}` : "";
    router.push(`/scans/${fresh.scanId}/inspect?page=${page.page_id}${issue}&from=${encodeURIComponent(from)}`);
  }

  if (error) {
    return (
      <div className="bg-white p-8 text-sm text-[#737373]">
        {error.includes("404") ? "No completed scan yet." : error}
      </div>
    );
  }
  if (!fresh?.forms) return <CompassLoader fullPage label="Loading forms…" />;

  return (
    <div className="bg-white px-6 py-10 lg:px-12">
      <header className="mb-8 border-b border-[#e5e5e5] pb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Privacy</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black">
          Review data collected and stored via forms
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#737373]">{INTRO}</p>
        <p className="mt-4 text-[11px] uppercase tracking-[0.12em] text-[#737373]">Assisted check</p>
        <dl className="mt-3 flex flex-wrap gap-8">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.12em] text-[#737373]">Forms to review</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-black">{forms.length}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.12em] text-[#737373]">Affected pages</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-black">{affectedPages.length}</dd>
          </div>
        </dl>
      </header>

      <section className="rounded-[3px] border border-[#e5e5e5] bg-white">
        <div className="flex border-b border-[#e5e5e5]">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              aria-current={item === tab ? "page" : undefined}
              className={`px-5 py-3 text-[13px] font-medium ${
                item === tab
                  ? "border-b-2 border-black text-black"
                  : "text-[#737373] hover:text-black"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {tab === "Pages" ? (
          <PagesTable pages={affectedPages} onInspect={inspectPage} />
        ) : (
          <IssuesTable forms={forms} onInspect={inspectForm} onApprove={approveForm} />
        )}
      </section>
    </div>
  );
}

function IssuesTable({
  forms,
  onInspect,
  onApprove,
}: {
  forms: PrivacyForm[];
  onInspect: (form: PrivacyForm) => void;
  onApprove: (form: PrivacyForm) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2 px-5 py-4">
        <h2 className="text-lg font-semibold text-black">Issues</h2>
        <span className="rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] px-2 py-0.5 text-[12px] font-medium text-[#525252]">
          {forms.length}
        </span>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr className="border-t border-[#e5e5e5] bg-[#fafafa] text-[11px] uppercase tracking-[0.12em] text-[#737373]">
            <th scope="col" className="w-[52px]" />
            <th scope="col" className="px-3 py-3 font-medium">Form</th>
            <th scope="col" className="w-[110px] px-3 py-3 text-right font-medium">Quantity</th>
            <th scope="col" className="w-[170px] py-3 pl-3 pr-5 text-right font-medium">Controls</th>
          </tr>
        </thead>
        <tbody>
          {forms.map((form) => (
            <tr key={form.signature} className="border-t border-[#e5e5e5] align-top last:border-b-0 hover:bg-[#fafafa]">
              <td className="py-4 pl-5">
                <button
                  type="button"
                  onClick={() => onInspect(form)}
                  disabled={form.pages.length === 0}
                  aria-label={`Inspect form ${form.action || "on this site"}`}
                  className="grid h-8 w-8 place-items-center rounded-[3px] border border-black bg-black text-white hover:bg-[#262626] disabled:opacity-40"
                >
                  <Search aria-hidden className="h-4 w-4" />
                </button>
              </td>
              <td className="px-3 py-4">
                <FormPreview form={form} />
              </td>
              <td className="px-3 py-4 text-right text-[14px] tabular-nums text-[#525252]">
                {form.quantity}
              </td>
              <td className="py-4 pl-3 pr-5 text-right">
                <button
                  type="button"
                  onClick={() => void onApprove(form)}
                  className="inline-flex items-center gap-1.5 rounded-[3px] border border-black bg-black px-3 py-2 text-[13px] font-semibold text-white hover:bg-[#262626]"
                >
                  <Check aria-hidden className="h-3.5 w-3.5" /> Approve form
                </button>
              </td>
            </tr>
          ))}
          {forms.length === 0 && (
            <tr>
              <td colSpan={4} className="px-5 py-10 text-center text-sm text-[#737373]">
                No forms left to review.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

function PagesTable({
  pages,
  onInspect,
}: {
  pages: AffectedPage[];
  onInspect: (page: AffectedPage) => void;
}) {
  if (pages.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-[#737373]">No affected pages.</p>;
  }

  return (
    <table className="w-full text-left">
      <thead>
        <tr className="bg-[#fafafa] text-[11px] uppercase tracking-[0.12em] text-[#737373]">
          <th scope="col" className="w-[52px]" />
          <th scope="col" className="px-3 py-3 font-medium">Page</th>
          <th scope="col" className="w-[140px] py-3 pl-3 pr-5 text-right font-medium">Forms</th>
        </tr>
      </thead>
      <tbody>
        {pages.map((page) => (
          <tr key={page.page_id} className="border-t border-[#e5e5e5] last:border-b-0 hover:bg-[#fafafa]">
            <td className="py-3 pl-5">
              <button
                type="button"
                onClick={() => onInspect(page)}
                aria-label={`Inspect ${page.page_url}`}
                className="grid h-8 w-8 place-items-center rounded-[3px] border border-black bg-black text-white hover:bg-[#262626]"
              >
                <Search aria-hidden className="h-4 w-4" />
              </button>
            </td>
            <td className="max-w-0 truncate px-3 py-3">
              <button
                type="button"
                onClick={() => onInspect(page)}
                className="block max-w-full truncate text-left text-[14px] font-medium text-black hover:underline"
                title={page.page_url}
              >
                {page.page_url}
              </button>
            </td>
            <td className="py-3 pl-3 pr-5 text-right text-[14px] tabular-nums text-[#525252]">{page.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The form as a visitor meets it: the first couple of fields drawn as the boxes
 * they are, with the rest summarised. A submit control is drawn as a button so
 * a search box reads as a search box.
 */
function FormPreview({ form }: { form: PrivacyForm }) {
  const visible = form.fields.filter((field) => field.type !== "hidden");
  const shown = (visible.length ? visible : form.fields).slice(0, 2);
  const remaining = Math.max(form.field_count - shown.length, 0);

  if (form.fields.length === 0) {
    return (
      <div className="max-w-[560px]">
        <p className="text-[13px] text-[#737373]">
          {form.field_count > 0
            ? `${form.field_count} field${form.field_count === 1 ? "" : "s"} — field details are captured from the next scan onwards.`
            : "No fields captured for this form."}
        </p>
        {form.action && (
          <p className="mt-1 truncate text-[12px] text-[#a3a3a3]" title={form.action}>
            Submits to {form.action}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-[560px] space-y-2">
      {shown.map((field, index) =>
        field.type === "submit" || field.type === "button" ? (
          <div
            key={`${field.label}-${index}`}
            className="rounded-[3px] border border-black bg-black px-3 py-2 text-center text-[13px] font-medium text-white"
          >
            {field.label || "Submit"}
          </div>
        ) : (
          <div
            key={`${field.label}-${index}`}
            className="rounded-[3px] border border-[#e5e5e5] bg-white px-3 py-2 text-[13px] text-[#525252]"
          >
            {field.required ? `* ${field.label}` : field.label}
          </div>
        ),
      )}
      {remaining > 0 && (
        <p className="text-center text-[13px] text-[#737373]">+ {remaining} fields</p>
      )}
    </div>
  );
}
