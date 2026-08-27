// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import SiteWidePagesPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "abc" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/auth", async () => {
  const actual: any = await vi.importActual("@/lib/auth");
  return {
    ...actual,
    getSitePages: vi.fn(async () => ({
      scan_id: "scan1",
      pages: [
        { page_id: "p1", title: "P1", cms: null, url: "https://x/p1", depth: 0, render_status: "ok", status_code: 200, is_error_page: false,
          score: 80, issue_count: 5, manual_review_count: 0, last_changed_at: null, render_unstable: false,
          desktop_screenshot_ref: null, mobile_screenshot_ref: null, word_count: 100, reading_age: 10.0, category_issue_count: null },
        { page_id: "p2", title: "P2", cms: null, url: "https://x/p2", depth: 0, render_status: "ok", status_code: 200, is_error_page: false,
          score: 70, issue_count: 9, manual_review_count: 0, last_changed_at: null, render_unstable: false,
          desktop_screenshot_ref: null, mobile_screenshot_ref: null, word_count: 100, reading_age: 10.0, category_issue_count: null },
      ],
    })),
  };
});

describe("/sites/[id]/pages", () => {
  it("renders the thumbnail strip and table", async () => {
    const { findByText, findAllByText } = render(<SiteWidePagesPage />);
    expect(await findByText("Pages with most issues")).toBeTruthy();
    // P2 appears twice: once in the thumbnail strip, once in the table below it.
    expect(await findAllByText("P2")).toHaveLength(2);
  });
});
