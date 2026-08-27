// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, fireEvent } from "@testing-library/react";

import { PagesTable } from "./PagesTable";

describe("PagesTable", () => {
  it("colors reading age red/amber/green by threshold", () => {
    const pages: any[] = [
      { page_id: "a", url: "https://x/a", title: "A", cms: null, depth: 0, render_status: "ok", status_code: 200, is_error_page: false,
        score: 50, issue_count: 1, manual_review_count: 0, last_changed_at: null, render_unstable: false,
        desktop_screenshot_ref: null, mobile_screenshot_ref: null, word_count: 10, reading_age: 16.2, category_issue_count: null },
      { page_id: "b", url: "https://x/b", title: "B", cms: null, depth: 0, render_status: "ok", status_code: 200, is_error_page: false,
        score: 50, issue_count: 1, manual_review_count: 0, last_changed_at: null, render_unstable: false,
        desktop_screenshot_ref: null, mobile_screenshot_ref: null, word_count: 10, reading_age: 12.0, category_issue_count: null },
      { page_id: "c", url: "https://x/c", title: "C", cms: null, depth: 0, render_status: "ok", status_code: 200, is_error_page: false,
        score: 50, issue_count: 1, manual_review_count: 0, last_changed_at: null, render_unstable: false,
        desktop_screenshot_ref: null, mobile_screenshot_ref: null, word_count: 10, reading_age: 9.5, category_issue_count: null },
    ];

    const { getAllByTestId } = render(
      <PagesTable siteId="s" scanId={"scan"} pages={pages as any} category="all" onInspect={() => {}} />
    );

    const els = getAllByTestId("reading-age");
    // JSDOM normalizes hex colors to rgb() in style attributes.
    expect((els[0].getAttribute("style") || "").toLowerCase()).toContain("rgb(220, 38, 38)");
    expect((els[1].getAttribute("style") || "").toLowerCase()).toContain("rgb(217, 119, 6)");
    expect((els[2].getAttribute("style") || "").toLowerCase()).toContain("rgb(22, 163, 74)");
  });
});


