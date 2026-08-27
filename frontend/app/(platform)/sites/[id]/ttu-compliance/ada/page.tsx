"use client";
import { TTUFilteredChecks } from "@/components/platform/site/TTUFilteredChecks";
import { useParams } from "next/navigation";
export default function Page() { const { id } = useParams<{ id: string }>(); if (!id) return null; return <TTUFilteredChecks siteId={id} category="ttu-compliance" subcategory="ADA / Section 508" title="ADA / Section 508" />; }
