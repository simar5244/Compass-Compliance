// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SiteCheckDetailPage from "@/app/(platform)/sites/[id]/checks/[checkId]/page";

afterEach(() => cleanup());

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "site1", checkId: "color-contrast" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/auth", async () => {
  const actual: any = await vi.importActual("@/lib/auth");
  return {
    ...actual,
    getSiteCheckDetail: vi.fn(async () => ({
      site_id: "site1",
      check_id: "color-contrast",
      latest_scan_id: "scan1",
      check: {
        category: "accessibility",
        subcategory: null,
        criterion_id: "1.4.3",
        criterion_name: "Contrast (Minimum)",
        wcag_version: "2.2",
        wcag_level: "AA",
        is_best_practice: false,
        check_score: 80,
        severity: "serious",
        pages_affected: 2,
        instances: 2,
      },
      series: [],
      pages: [],
      issues: [
        {
          id: "i1",
          rule_id: "color-contrast",
          category: "accessibility",
          subcategory: null,
          impact: "serious",
          description: "Low contrast text",
          remediation: "Fix contrast",
          reference_url: "",
          wcag_version: null,
          wcag_level: null,
          criterion_id: null,
          criterion_name: "Low contrast text",
          is_best_practice: false,
          manual_review: false,
          reviewed: false,
          selector: "a.nav",
          html_snippet: null,
          bbox: { x: 1, y: 1, width: 10, height: 10 },
          viewport: "desktop",
          page_id: "p1",
          page_url: "https://example.com/a",
          page_score: 90,
        },
        {
          id: "i2",
          rule_id: "color-contrast",
          category: "accessibility",
          subcategory: null,
          impact: "serious",
          description: "Low contrast text",
          remediation: "Fix contrast",
          reference_url: "",
          wcag_version: null,
          wcag_level: null,
          criterion_id: null,
          criterion_name: "Low contrast text",
          is_best_practice: false,
          manual_review: false,
          reviewed: false,
          selector: "a.footer",
          html_snippet: null,
          bbox: null,
          viewport: "desktop",
          page_id: "p2",
          page_url: "https://example.com/b",
          page_score: 70,
        },
      ],
    })),
    ignoreIssues: vi.fn(async () => ({ ok: true, updated: 2 })),
    getCheckHistory: vi.fn(async () => ({
      check_id: "color-contrast",
      points: [
        { scan_id: "s0", at: "2026-01-01T00:00:00Z", issues: 5, score: 60 },
        { scan_id: "scan1", at: "2026-02-01T00:00:00Z", issues: 2, score: 80 },
      ],
    })),
    getSiteChecksFull: vi.fn(async () => ({
      checks: [{ check_id: "color-contrast", progress: 80 }],
    })),
  };
});

describe("Site check detail grouped table", () => {
  it("shows issue group with pages affected and per-page Inspect", async () => {
    render(<SiteCheckDetailPage />);
    expect(await screen.findByText(/Issue types/i)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByText(/View pages/i));

    // Inspect is an icon button, named for the page it opens.
    expect(await screen.findAllByRole("button", { name: /^Inspect https:/ })).toHaveLength(2);
    expect(screen.getByText(/Score 90/i)).toBeTruthy();
    expect(screen.getByText(/Score 70/i)).toBeTruthy();
  });
});
