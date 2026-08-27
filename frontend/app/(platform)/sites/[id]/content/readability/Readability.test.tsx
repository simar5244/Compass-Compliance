// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import ContentReadabilityPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "abc" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/CompassLoader", () => ({
  CompassLoader: ({ label }: { label?: string }) => <div>{label}</div>,
}));

const page = (id: string, title: string, readingAge: number) => ({
  page_id: id, title, cms: null, url: `https://x/${id}`, depth: 0,
  render_status: "ok", status_code: 200, is_error_page: false,
  score: 80, issue_count: 5, manual_review_count: 0, last_changed_at: null,
  render_unstable: false, desktop_screenshot_ref: null, mobile_screenshot_ref: null,
  word_count: 100, reading_age: readingAge, category_issue_count: 1,
});

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getSitePages: vi.fn(async () => ({
      scan_id: "scan1",
      pages: [page("p1", "Hard page", 16.2), page("p2", "Easy page", 9.4)],
    })),
    getCheckHistory: vi.fn(async () => ({
      check_id: "readability",
      points: [
        { scan_id: "s0", at: "2026-01-01T00:00:00Z", issues: 30, score: 50 },
        { scan_id: "scan1", at: "2026-02-01T00:00:00Z", issues: 20, score: 62 },
      ],
    })),
    getSiteChecksFull: vi.fn(async () => ({
      checks: [{ check_id: "readability", progress: 62 }],
    })),
    ignoreIssues: vi.fn(async () => ({ ok: true, updated: 1 })),
  };
});

describe("Content Readability", () => {
  it("renders the check shell and sorts pages by reading age, hardest first", async () => {
    const { findByText, container } = render(<ContentReadabilityPage />);

    expect(await findByText("Consider making text easier to understand")).toBeTruthy();

    // Reading age is the second-to-last cell in each row.
    const ages = [...container.querySelectorAll("tbody tr")].map((row) => {
      const cells = row.querySelectorAll("td");
      return cells[cells.length - 2]?.textContent?.trim();
    });
    expect(ages[0]).toBe("16.2");
    expect(ages[1]).toBe("9.4");
  });
});
