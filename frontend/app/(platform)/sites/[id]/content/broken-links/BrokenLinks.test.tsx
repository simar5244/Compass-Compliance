// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import ContentBrokenLinksPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "abc" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/sites/abc/content/broken-links",
  useSearchParams: () => new URLSearchParams("tab=links"),
}));

vi.mock("@/components/CompassLoader", () => ({
  CompassLoader: ({ label }: { label?: string }) => <div>{label}</div>,
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getCheckLinksFull: vi.fn(async () => ({
      scan_id: "scan1",
      check_id: "broken-links",
      items: [
        {
          url: "https://external.example.com/very/long/path/name",
          link_type: "external",
          status_text: "Broken link (HTTP 404)",
          http_status: 404,
          error_type: "HTTP 404",
          anchor_text: "Student Organizations",
          pages_affected: 1,
          instances: [
            {
              issue_id: "i1", page_id: "p1", page_url: "https://example.com/page",
              page_score: 88, page_issue_count: 5, page_manual_review_count: 0,
              viewport: "desktop", has_bbox: true,
            },
          ],
        },
      ],
    })),
    getCheckHistory: vi.fn(async () => ({
      check_id: "broken-links",
      points: [
        { scan_id: "s0", at: "2026-01-01T00:00:00Z", issues: 12, score: 30 },
        { scan_id: "scan1", at: "2026-02-01T00:00:00Z", issues: 1, score: 90 },
      ],
    })),
    getSiteChecksFull: vi.fn(async () => ({
      checks: [{ check_id: "broken-links", progress: 90 }],
    })),
    ignoreIssues: vi.fn(async () => ({ ok: true, updated: 1 })),
  };
});

describe("Content Broken links", () => {
  it("shows the link, its type and its HTTP status inside the check shell", async () => {
    const { findByText, findByRole } = render(<ContentBrokenLinksPage />);

    expect(await findByText("Check and fix broken links")).toBeTruthy();
    expect(await findByRole("link", { name: /external\.example\.com/ })).toBeTruthy();
    expect(await findByText("external")).toBeTruthy();
    // A 404 is reported in words rather than as a raw status code.
    expect(await findByText("Page not found")).toBeTruthy();
    expect(await findByRole("button", { name: /Inspect https:\/\/external\.example\.com/ })).toBeTruthy();
  });
});
