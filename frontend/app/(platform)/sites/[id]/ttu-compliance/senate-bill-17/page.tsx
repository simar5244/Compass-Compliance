"use client";

import { useParams } from "next/navigation";
import TTUSB17Overview from "@/components/platform/site/TTUSB17Overview";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <TTUSB17Overview />;
}
