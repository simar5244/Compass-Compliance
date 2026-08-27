"use client";

import { TTUFilteredChecks } from "@/components/platform/site/TTUFilteredChecks";
import { useParams } from "next/navigation";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return (
    <TTUFilteredChecks
      siteId={id}
      category="ttu-compliance"
      subcategory="FERPA"
      title="FERPA"
      eyebrow="TTU Compliance"
      description="Family Educational Rights and Privacy Act checks for this site — student education records, directory information, and related disclosures."
    />
  );
}
