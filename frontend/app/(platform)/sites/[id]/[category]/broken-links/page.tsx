"use client";

import { useParams } from "next/navigation";
import ContentBrokenLinksPage from "@/app/(platform)/sites/[id]/content/broken-links/page";

export default function CategoryBrokenLinksRedirectPage() {
  useParams();
  return <ContentBrokenLinksPage />;
}
