"use client";
import { useParams } from "next/navigation";
import { TTUFilteredChecks } from "@/components/platform/site/TTUFilteredChecks";
export default function Page() { const { id } = useParams<{ id: string }>(); if (!id) return null; return <TTUFilteredChecks siteId={id} category="ttu-compliance" subcategory="Emergency Info" title="Emergency Info" />; }
