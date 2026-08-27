"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Eye,
  FileStack,
  LayoutDashboard,
  LineChart,
  Lock,
  PanelLeft,
  PanelLeftClose,
  Palette,
  Scale,
  Shield,
  Sparkles,
  Type,
  Workflow,
} from "lucide-react";
import type { SiteDetail } from "@/lib/auth";
import { CompassMark } from "@/components/CompassMark";
import { AppSidebarTools } from "@/components/platform/AppSidebarTools";
import { NavBar } from "@/components/platform/NavBar";
import { useUser } from "@/components/platform/PlatformShell";
import { relativeTime } from "@/components/platform/ui";
import { getSiteChecksFull } from "@/lib/auth";

type TopKey =
  | "overview"
  | "content"
  | "accessibility"
  | "marketing"
  | "ux"
  | "developer"
  | "designer"
  | "privacy"
  | "policies"
  | "ttu-compliance"
  | "brand-standards"
  | "inventory"
  | "annotations"
  | "targets"
  | "analytics";

type NavItem = {
  key: TopKey;
  label: string;
  href?: string;
  disabled?: boolean;
  badge?: string;
  divider?: boolean;
};

type SubItem = { label: string; href: string; divider?: boolean; header?: string };

function topHref(siteId: string, key: TopKey): string {
  if (key === "overview") return `/sites/${siteId}`;
  return `/sites/${siteId}/${key}`;
}

function deriveActiveTop(pathname: string, siteId: string): TopKey {
  const base = `/sites/${siteId}`;
  if (!pathname.startsWith(base)) return "overview";
  const rest = pathname.slice(base.length).replace(/^\//, "");
  const first = rest.split("/")[0] || "";
  if (!first) return "overview";
  if (first === "compare" || first === "checks") return "overview";

  const allowed: Set<TopKey> = new Set([
    "content",
    "accessibility",
    "marketing",
    "ux",
    "developer",
    "designer",
    "privacy",
    "policies",
    "ttu-compliance",
    "brand-standards",
    "inventory",
    "annotations",
    "targets",
    "analytics",
  ]);
  return allowed.has(first as TopKey) ? (first as TopKey) : "overview";
}

function subNav(siteId: string, key: TopKey): SubItem[] {
  const base = topHref(siteId, key);
  if (key === "content") {
    return [
      { label: "Overview", href: base },
      { label: "Checks", href: `${base}/checks` },
      { label: "Pages", href: `${base}/pages` },
      { label: "PDFs", href: `${base}/pdfs` },
      { divider: true, label: "", href: "#" },
      { header: "Sub-checks", label: "", href: "#" },
      { label: "Spelling", href: `${base}/spelling` },
      { label: "Grammar", href: `${base}/grammar` },
      { label: "Broken links", href: `${base}/broken-links` },
      { label: "Readability", href: `${base}/readability` },
      { label: "Content accessibility", href: `${base}/content-accessibility` },
      { label: "Content SEO", href: `${base}/content-seo` },
      { label: "Images", href: `${base}/images` },
      { divider: true, label: "", href: "#" },
    ];
  }
  if (key === "accessibility") {
    return [
      { label: "Overview", href: base },
      { label: "Checks", href: `${base}/checks` },
      { label: "Pages", href: `${base}/pages` },
      { label: "PDFs", href: `${base}/pdfs` },
      { label: "Mobile", href: `${base}/mobile` },
      { label: "Guidelines", href: `${base}/guidelines` },
      { label: "Manual audits", href: `${base}/manual-audits` },
      { divider: true, label: "", href: "#" },
      { label: "Decisions", href: `${base}/decisions` },
    ];
  }
  if (key === "marketing") {
    return [
      { label: "Overview", href: base },
      { label: "Checks", href: `${base}/checks` },
      { label: "Pages", href: `${base}/pages` },
      { label: "Keywords", href: `${base}/keywords` },
      { label: "Ads", href: `${base}/ads` },
      { label: "Content optimization", href: `${base}/content-optimization` },
      { label: "Technical optimization", href: `${base}/technical-optimization` },
      { label: "Amount of content", href: `${base}/amount-of-content` },
      { divider: true, label: "", href: "#" },
      { label: "Decisions", href: `${base}/decisions` },
    ];
  }
  if (key === "ux") {
    return [
      { label: "Overview", href: base },
      { label: "Checks", href: `${base}/checks` },
      { label: "Pages", href: `${base}/pages` },
      { label: "Mobile", href: `${base}/mobile` },
      { label: "Web Vitals", href: `${base}/web-vitals` },
      { label: "Images", href: `${base}/images` },
      { label: "Functionality", href: `${base}/functionality` },
      { divider: true, label: "", href: "#" },
      { label: "Decisions", href: `${base}/decisions` },
    ];
  }
  if (key === "developer") {
    return [
      { label: "Overview", href: base },
      { label: "Checks", href: `${base}/checks` },
      { divider: true, label: "", href: "#" },
      { label: "Decisions", href: `${base}/decisions` },
    ];
  }
  if (key === "designer") {
    return [
      { label: "Overview", href: base },
      { label: "Checks", href: `${base}/checks` },
      { divider: true, label: "", href: "#" },
      { label: "Decisions", href: `${base}/decisions` },
    ];
  }
  if (key === "privacy") {
    return [
      { label: "Overview", href: base },
      { label: "Checks", href: `${base}/checks` },
      { label: "Pages", href: `${base}/pages` },
      { label: "Phone numbers", href: `${base}/phone-numbers` },
      { label: "Emails", href: `${base}/emails` },
      { label: "Forms", href: `${base}/forms` },
      { divider: true, label: "", href: "#" },
      { label: "Decisions", href: `${base}/decisions` },
    ];
  }
  if (key === "policies") {
    return [
      { label: "Overview", href: base },
      { label: "Pages", href: `${base}/pages` },
      { divider: true, label: "", href: "#" },
      { label: "Decisions", href: `${base}/decisions` },
    ];
  }
  if (key === "ttu-compliance") {
    return [
      { label: "Overview", href: base },
      { label: "Checks", href: `${base}/checks` },
      { label: "Pages", href: `${base}/pages` },
      { label: "ADA / Section 508", href: `${base}/ada` },
      { label: "FERPA", href: `${base}/ferpa` },
      { label: "Senate Bill 17", href: `${base}/sb17` },
      { label: "Emergency Info", href: `${base}/emergency` },
      { label: "Content Health", href: `${base}/content-health` },
    ];
  }
  if (key === "brand-standards") {
    return [
      { label: "Overview", href: base },
      { label: "Checks", href: `${base}/checks` },
      { label: "Pages", href: `${base}/pages` },
      { label: "Colors", href: `${base}/colors` },
      { label: "Typography", href: `${base}/typography` },
      { label: "Logo Usage", href: `${base}/logo` },
      { label: "Buttons & Components", href: `${base}/buttons` },
    ];
  }
  return [{ label: "Overview", href: base }];
}

const ICONS: Record<TopKey, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  content: Type,
  accessibility: Eye,
  marketing: LineChart,
  ux: Sparkles,
  developer: Workflow,
  designer: Palette,
  privacy: Lock,
  policies: Scale,
  "ttu-compliance": Shield,
  "brand-standards": BookOpen,
  inventory: FileStack,
  annotations: LayoutDashboard,
  targets: LayoutDashboard,
  analytics: LayoutDashboard,
};

export function SiteSidebar({
  siteId,
  site,
  children,
}: {
  siteId: string;
  site: SiteDetail | null;
  children?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const params = useParams<{ id: string }>();
  const effectiveSiteId = siteId || params.id;
  const user = useUser();
  const [policyCount, setPolicyCount] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [openSubNavKey, setOpenSubNavKey] = useState<TopKey | null>(null);

  const sidebarWidth = expanded ? 240 : 72;

  /** Collapse the rail only when the user picks a destination page. */
  const goToPage = (href: string) => {
    setOpenSubNavKey(null);
    setExpanded(false);
    router.push(href);
  };

  const toggleExpanded = () => {
    setExpanded((value) => {
      if (value) setOpenSubNavKey(null);
      return !value;
    });
  };

  useEffect(() => {
    getSiteChecksFull(effectiveSiteId, "policies")
      .then((result) => setPolicyCount(result.checks.reduce((sum, check) => sum + (check.issues ?? 0), 0)))
      .catch(() => setPolicyCount(null));
  }, [effectiveSiteId]);

  const activeTop = useMemo(
    () => deriveActiveTop(pathname, effectiveSiteId),
    [pathname, effectiveSiteId],
  );

  const nav: NavItem[] = [
    { key: "overview", label: "Overview" },
    { key: "content", label: "Content" },
    { key: "accessibility", label: "Accessibility" },
    { key: "marketing", label: "Marketing" },
    { key: "ux", label: "User Experience" },
    { key: "developer", label: "Developer" },
    { key: "designer", label: "Designer" },
    { key: "privacy", label: "Privacy" },
    { key: "policies", label: "Policies", badge: policyCount == null ? undefined : String(policyCount) },
    { key: "ttu-compliance", label: "TTU Compliance" },
    { key: "brand-standards", label: "Brand Standards" },
    { key: "inventory", label: "Inventory" },
  ];

  function categorySubs(key: TopKey): SubItem[] {
    return key === "overview" ? [] : subNav(effectiveSiteId, key);
  }

  function hasSubNav(key: TopKey): boolean {
    const items = categorySubs(key).filter((item) => !item.divider && !item.header);
    return items.length > 1;
  }

  /** Collapsed icon or expanded row: open children, or navigate when there are none. */
  function activateCategory(key: TopKey) {
    const href = topHref(effectiveSiteId, key);
    if (!hasSubNav(key)) {
      goToPage(href);
      return;
    }
    if (!expanded) {
      setExpanded(true);
      setOpenSubNavKey(key);
      return;
    }
    setOpenSubNavKey((current) => (current === key ? null : key));
  }

  return (
    <div className="flex min-h-screen min-w-0">
      <aside
        className="sticky top-0 z-40 flex h-screen shrink-0 flex-col bg-black text-white transition-[width] duration-200 ease-out"
        style={{ width: sidebarWidth }}
        aria-expanded={expanded}
      >
          <div className="flex h-14 w-[72px] shrink-0 items-center justify-center">
            <button
              type="button"
              onClick={() => goToPage("/dashboard")}
              className="grid size-14 place-items-center hover:bg-white/10"
              aria-label="Texas Tech — go to websites"
            >
              <CompassMark size={36} decorative />
            </button>
          </div>

          <div className="flex h-10 w-[72px] shrink-0 items-center justify-center">
            <button
              type="button"
              onClick={toggleExpanded}
              className="grid size-10 place-items-center text-white/70 hover:bg-white/10 hover:text-white"
              aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
              aria-expanded={expanded}
            >
              {expanded ? <PanelLeftClose aria-hidden size={18} /> : <PanelLeft aria-hidden size={18} />}
            </button>
          </div>

          <nav
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden"
            data-site-nav
            style={{ scrollbarWidth: "none" }}
          >
            {nav.map((item) => {
              const Icon = ICONS[item.key] ?? LayoutDashboard;
              const active = item.key === activeTop;
              const itemSubs = categorySubs(item.key);
              const subs = hasSubNav(item.key);
              const subsOpen = expanded && openSubNavKey === item.key && subs;

              return (
                <div key={item.key} className="relative shrink-0">
                  {!expanded ? (
                    <button
                      type="button"
                      title={item.label}
                      disabled={!!item.disabled}
                      onClick={() => activateCategory(item.key)}
                      aria-current={active ? "page" : undefined}
                      aria-expanded={subs ? subsOpen : undefined}
                      aria-label={item.label}
                      className={`relative flex h-10 w-[72px] items-center justify-center disabled:opacity-40 ${
                        active ? "bg-white text-black" : "text-white/70 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <Icon aria-hidden size={18} strokeWidth={1.75} />
                      {item.badge && (
                        <span className="absolute left-[42px] top-1 min-w-4 bg-white px-0.5 text-[9px] font-semibold text-black">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={!!item.disabled}
                        onClick={() => activateCategory(item.key)}
                        aria-current={!subs && active ? "page" : undefined}
                        aria-expanded={subs ? subsOpen : undefined}
                        aria-label={subs ? `${item.label} sub-pages` : item.label}
                        className={`relative flex h-10 w-[240px] items-center disabled:opacity-40 ${
                          active ? "bg-white text-black" : "text-white/70 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span
                          className={`grid h-10 w-[72px] shrink-0 place-items-center ${
                            active ? "text-black" : "text-inherit"
                          }`}
                        >
                          <Icon aria-hidden size={18} strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0 flex-1 truncate pr-8 text-left text-[13px] font-medium">
                          {item.label}
                        </span>
                        {item.badge && (
                          <span
                            className={`absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[9px] font-semibold ${
                              active ? "bg-black text-white" : "bg-white/15 text-white"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                      {subsOpen && (
                        <div className="w-[240px] bg-black py-1">
                          {itemSubs.map((s, idx) => {
                            if (s.divider) return <div key={`d-${idx}`} className="my-1 h-px bg-white/15" />;
                            if (s.header) {
                              return (
                                <div
                                  key={`h-${idx}`}
                                  className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40"
                                >
                                  {s.header}
                                </div>
                              );
                            }
                            const subActive = pathname === s.href;
                            return (
                              <button
                                type="button"
                                key={s.href}
                                onClick={() => goToPage(s.href)}
                                aria-current={subActive ? "page" : undefined}
                                className={`flex w-full px-3 py-1.5 text-left text-[13px] ${
                                  subActive
                                    ? "bg-white text-black"
                                    : "text-white/65 hover:bg-white/10 hover:text-white"
                                }`}
                                style={{ fontWeight: subActive ? 700 : 500 }}
                              >
                                {s.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </nav>

          <AppSidebarTools expanded={expanded} onRequestExpand={() => setExpanded(true)} />

          {expanded && (
            <p className="shrink-0 px-4 py-3 text-[11px] text-white/40">
              Last scan{" "}
              <span className="text-white/80">{relativeTime(site?.last_scanned_at ?? null)}</span>
            </p>
          )}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {user ? <NavBar user={user} /> : <div className="h-14 shrink-0 bg-black" />}
        <main className="min-h-0 min-w-0 flex-1 overflow-auto bg-white">{children}</main>
      </div>
    </div>
  );
}
