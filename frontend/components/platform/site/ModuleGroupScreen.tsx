"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { getSiteChecksFull, type SiteCheckRow } from "@/lib/auth";
import { SubCheckShell } from "@/components/platform/site/SubCheckShell";
import { ContentWithIssuesTab, ModuleCheckTable } from "@/components/platform/site/ModuleCheckList";

const TABS = ["Checks", "Content with issues"] as const;

/**
 * One area of a module — marketing's two halves, user experience's
 * functionality — as its own score and trend above that area's checks. Every
 * such screen renders identically, so they all share this one.
 */
export function ModuleGroupScreen({
  module,
  title,
  heading,
  intro,
  trendLabel,
}: {
  /** Registered grouping key, e.g. "technical-optimization". */
  module: string;
  title: string;
  /** The wording above the description, e.g. "Optimize your technology". */
  heading: string;
  intro: string;
  /** Heading over the trend; defaults to "Score over time". */
  trendLabel?: string;
}) {
  const params = useParams<{ id: string }>();
  const requestKey = `${params.id}:${module}`;
  const [loaded, setLoaded] = useState<{ key: string; checks: SiteCheckRow[] | null; error: string | null }>({
    key: "", checks: null, error: null,
  });
  const [tab, setTab] = useState<string>(TABS[0]);

  useEffect(() => {
    let cancelled = false;
    getSiteChecksFull(params.id, module)
      .then((r) => { if (!cancelled) setLoaded({ key: requestKey, checks: r.checks, error: null }); })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey, checks: null,
            error: e instanceof Error ? e.message : `Failed to load ${title.toLowerCase()}`,
          });
        }
      });
    return () => { cancelled = true; };
  }, [params.id, module, requestKey, title]);

  const fresh = loaded.key === requestKey ? loaded : null;
  const checks = fresh?.checks ?? null;
  const error = fresh?.error ?? null;

  if (error) return <div className="p-8 text-[#dc2626]">{error}</div>;
  if (!checks) return <CompassLoader fullPage label={`Loading ${title.toLowerCase()}…`} />;

  return (
    <SubCheckShell
      title={title}
      introHeading={heading}
      scoreLabel={title}
      trendLabel={trendLabel ?? "Score over time"}
      intro={intro}
      scoreModule={module}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === "Checks" ? (
        <ModuleCheckTable checks={checks} />
      ) : (
        <ContentWithIssuesTab checks={checks} heading="Content with issues" />
      )}
    </SubCheckShell>
  );
}
