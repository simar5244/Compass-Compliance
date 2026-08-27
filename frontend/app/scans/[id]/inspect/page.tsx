"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Inspector } from "@/components/Inspector";
import { AuthenticatedSurface } from "@/components/AuthenticatedSurface";
import { CompassLogo } from "@/components/CompassLogo";

export default function InspectPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const pageId = search.get("page");
  const issueId = search.get("issue");
  const from = search.get("from");
  // A specific exposed phone number / email to outline, if the reader picked one.
  const value = search.get("value");

  if (!pageId) {
    return (
      <AuthenticatedSurface>
        <main className="light-theme flex min-h-screen flex-col items-center justify-center bg-white px-6 py-16 text-black">
          <div className="w-full max-w-xl border border-[#e5e5e5] bg-white p-8">
            <CompassLogo size="md" />
            <h1 className="mt-4 text-2xl font-semibold text-black">No page selected</h1>
            <p className="mt-1 text-sm leading-6 text-[#6b7280]">
              Open an inspection from a scan page to review issues on a specific URL.
            </p>
            <a
              href={`/scans/${params.id}`}
              className="mt-6 inline-flex h-11 items-center justify-center bg-black px-4 text-sm font-medium text-white hover:bg-[#262626]"
            >
              Back to overview
            </a>
          </div>
        </main>
      </AuthenticatedSurface>
    );
  }

  return (
    <AuthenticatedSurface>
      <div className="light-theme min-h-screen bg-white text-black">
        <Inspector scanId={params.id} pageId={pageId} focusIssueId={issueId} focusValue={value} returnTo={from} />
      </div>
    </AuthenticatedSurface>
  );
}
