"use client";

import { useParams } from "next/navigation";
import ContentGrammarPage from "@/app/(platform)/sites/[id]/content/grammar/page";

export default function CategoryGrammarRedirectPage() {
  useParams();
  return <ContentGrammarPage />;
}
