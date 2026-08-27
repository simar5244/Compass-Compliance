"use client";

import { useParams } from "next/navigation";
import ContentSpellingPage from "@/app/(platform)/sites/[id]/content/spelling/page";

export default function CategorySpellingRedirectPage() {
  // Keep a stable category-scoped URL in case other parts of the app still link here.
  // The canonical route is now `/sites/[id]/content/spelling`.
  useParams();
  return <ContentSpellingPage />;
}
