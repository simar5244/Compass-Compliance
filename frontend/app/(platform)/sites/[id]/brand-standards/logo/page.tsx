"use client";
import { TTUFilteredChecks } from "@/components/platform/site/TTUFilteredChecks";
import { useParams } from "next/navigation";
export default function Page() { const { id } = useParams<{ id: string }>(); if (!id) return null; return <TTUFilteredChecks siteId={id} category="brand-standards" subcategory="Logo Usage" title="Logo Usage" />; }
