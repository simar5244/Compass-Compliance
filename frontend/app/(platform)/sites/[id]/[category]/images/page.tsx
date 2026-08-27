"use client";

import { useParams } from "next/navigation";
import ContentImagesPage from "@/app/(platform)/sites/[id]/content/images/page";

export default function CategoryImagesRedirectPage() {
  useParams();
  return <ContentImagesPage />;
}
