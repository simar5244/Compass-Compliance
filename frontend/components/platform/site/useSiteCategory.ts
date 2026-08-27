"use client";

import { useParams, usePathname } from "next/navigation";

/** Site id from the URL — always present on `/sites/[id]/…` routes. */
export function useSiteId(): string {
  const params = useParams<{ id: string }>();
  return params.id;
}

/**
 * Module key (content, accessibility, marketing, …). Dynamic `[category]` routes
 * expose it as a param; static category folders (accessibility/, marketing/, …)
 * only encode it in the path, so we read it from there when the param is absent.
 */
export function useSiteCategory(): string {
  const params = useParams<{ category?: string }>();
  const pathname = usePathname() ?? "";
  if (params.category) return params.category;

  const parts = pathname.split("/").filter(Boolean);
  const sitesIdx = parts.indexOf("sites");
  return sitesIdx >= 0 ? parts[sitesIdx + 2] ?? "" : "";
}

/** Trailing path segments after the module key, e.g. `mobile` or `keywords`. */
export function useSiteRestSegments(): string[] {
  const params = useParams<{ rest?: string[] }>();
  const pathname = usePathname() ?? "";
  if (params.rest?.length) return params.rest;

  const parts = pathname.split("/").filter(Boolean);
  const sitesIdx = parts.indexOf("sites");
  if (sitesIdx < 0) return [];
  return parts.slice(sitesIdx + 3);
}
