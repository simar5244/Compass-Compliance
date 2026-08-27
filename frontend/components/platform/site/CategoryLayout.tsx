"use client";

import { useEffect, useState } from "react";
import { getSite, type SiteDetail } from "@/lib/auth";
import { SiteSidebar } from "@/components/platform/site/SiteSidebar";

export function CategoryLayout({
  siteId,
  children,
}: {
  siteId: string;
  children: React.ReactNode;
}) {
  const [site, setSite] = useState<SiteDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSite(siteId)
      .then((s) => {
        if (!cancelled) setSite(s);
      })
      .catch(() => {
        if (!cancelled) setSite(null);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  return (
    <SiteSidebar siteId={siteId} site={site}>
      {children}
    </SiteSidebar>
  );
}
