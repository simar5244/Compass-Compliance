"use client";

import { useParams } from "next/navigation";
import ContentReadabilityPage from "@/app/(platform)/sites/[id]/content/readability/page";

export default function CategoryReadabilityRedirectPage() {
  useParams();
  return <ContentReadabilityPage />;
}
