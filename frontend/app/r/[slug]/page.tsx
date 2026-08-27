"use client";

import { useParams } from "next/navigation";
import { InstantReport } from "@/components/InstantReport";
import { AuthenticatedSurface } from "@/components/AuthenticatedSurface";

export default function InstantReportPage() {
  const params = useParams<{ slug: string }>();
  return (
    <AuthenticatedSurface>
      <div className="light-theme min-h-screen bg-white text-black">
        <InstantReport slug={params.slug} />
      </div>
    </AuthenticatedSurface>
  );
}
