// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InspectorInfoPanel, relativeScanTime, truncateUrl } from "./InspectorInfoPanel";
import type { PageDetail } from "@/lib/api";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("InspectorInfoPanel", () => {
  it("renders page metadata in the required order and formats values", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T16:05:00Z"));
    const longUrl = "https://www.depts.ttu.edu/k12/a/very/long/path/that/exceeds/fifty/characters";
    const page: PageDetail = {
      id: "p1",
      scan_id: "s1",
      url: longUrl,
      final_url: longUrl,
      title: "Home | Texas Tech K-12 | Texas Tech",
      render_status: "ok",
      is_error_page: false,
      is_document: false,
      score: 71,
      score_a: 80,
      score_aa: 75,
      score_aaa: 70,
      category_scores: {},
      issue_count: 125,
      manual_review_count: 23,
      word_count: 1240,
      reading_age: 12.1,
      render_ms: 4200,
      render_time_ms: 4200,
      status_code: 200,
      http_status: 200,
      last_scanned_at: "2026-07-31T14:05:00Z",
      issue_count_automated: 125,
      issue_count_manual: 23,
      dom_ref: null,
      screenshots: {},
      issues: [],
    };

    render(<InspectorInfoPanel page={page} />);
    const panel = screen.getByRole("region", { name: "Page information" });
    const link = within(panel).getByRole("link", { name: truncateUrl(longUrl) });
    expect(link.getAttribute("href")).toBe(longUrl);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("title")).toBe(longUrl);
    expect(within(panel).getByText(page.title!)).toBeTruthy();
    expect(within(panel).getByRole("img", { name: "Score 71 percent" })).toBeTruthy();
    expect(within(panel).getByText("1,240 words")).toBeTruthy();
    expect(within(panel).getByText("12.1")).toBeTruthy();
    expect(within(panel).getByText("2 hours ago")).toBeTruthy();
    expect(within(panel).getByText("4,200 ms")).toBeTruthy();
    expect(within(panel).getByText("200 OK")).toBeTruthy();
    expect(within(panel).getByText("125 automated · 23 manual review")).toBeTruthy();
    expect(within(panel).getByText("No (Web page)")).toBeTruthy();

    const text = panel.textContent ?? "";
    const labels = ["URL", "Page title", "Page score", "Word count", "Reading age", "Last scanned", "Render time", "HTTP status", "Issues found", "Is document"];
    labels.slice(1).forEach((label, index) => {
      expect(text.indexOf(labels[index])).toBeLessThan(text.indexOf(label));
    });
  });

  it("handles URL and relative-time boundaries", () => {
    expect(truncateUrl("x".repeat(51))).toHaveLength(50);
    expect(relativeScanTime("2026-07-30T16:05:00Z", new Date("2026-07-31T16:05:00Z").getTime())).toBe("yesterday");
    expect(relativeScanTime("2026-07-28T16:05:00Z", new Date("2026-07-31T16:05:00Z").getTime())).toBe("3 days ago");
  });
});
