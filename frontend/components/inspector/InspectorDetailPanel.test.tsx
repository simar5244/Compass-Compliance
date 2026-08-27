// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InspectorDetailPanel } from "./InspectorDetailPanel";
import type { IssueOut } from "@/lib/api";

afterEach(() => cleanup());

describe("InspectorDetailPanel", () => {
  it("renders catalog details, parsed snippets, WCAG, and actions in Silktide order", () => {
    const issue: IssueOut = {
      id: "manual-1",
      rule_id: "aria-required-attr",
      display_name: "Ensure required ARIA attributes are present",
      check_description: "Add every required ARIA attribute to the affected element.",
      category: "accessibility",
      subcategory: "ARIA",
      impact: "critical",
      description: "Required ARIA attributes are missing",
      remediation: "Legacy remediation",
      reference_url: "",
      wcag_version: "2.0",
      wcag_level: "A",
      criterion_id: "4.1.1",
      criterion_name: "Parsing",
      is_best_practice: false,
      manual_review: true,
      reviewed: false,
      selector: "#element-id",
      html_snippet: JSON.stringify({ error_text: "aria-controls is missing", ignored: "do not dump this" }),
      bbox: null,
      viewport: "desktop",
    };

    render(
      <InspectorDetailPanel
        issue={issue}
        instances={[issue]}
        severity="error"
        aiOpen={false}
        onSelectInstance={vi.fn()}
        onReview={vi.fn()}
        onIgnore={vi.fn()}
        onToggleAI={vi.fn()}
        onCloseAI={vi.fn()}
      />,
    );

    const panel = screen.getByRole("complementary", { name: "Issue details" });
    expect(within(panel).getByText("Critical")).toBeTruthy();
    expect(within(panel).getByText("Manual review")).toBeTruthy();
    expect(within(panel).getByRole("heading", { name: issue.display_name })).toBeTruthy();
    expect(within(panel).getByText("Accessibility · ARIA")).toBeTruthy();
    expect(within(panel).getByText("WCAG 2.0 A 4.1.1")).toBeTruthy();
    expect(within(panel).getByText(issue.check_description)).toBeTruthy();
    expect(within(panel).getByText("#element-id")).toBeTruthy();
    const snippet = within(panel).getByText("aria-controls is missing");
    expect(snippet).toBeTruthy();
    expect(snippet.closest("pre")?.className).toContain("font-mono");
    expect(within(panel).queryByText(/ignored/)).toBeNull();

    expect(within(panel).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Mark as reviewed",
      "Ignore this issue",
      "✦ Ask AI about this issue",
    ]);
  });

  it.each([403, 999])("flags HTTP %i broken-link results as possible false positives", (status) => {
    const issue: IssueOut = {
      id: `broken-${status}`,
      rule_id: "external-broken-url",
      display_name: "Check and fix broken links",
      check_description: "Update the broken destination.",
      category: "content",
      subcategory: "Links",
      impact: "serious",
      description: "Broken link",
      remediation: "Update the link.",
      reference_url: "",
      wcag_version: null,
      wcag_level: null,
      criterion_id: null,
      criterion_name: null,
      is_best_practice: false,
      manual_review: false,
      reviewed: false,
      selector: "a.external",
      html_snippet: JSON.stringify({
        url: `https://blocked.example/${status}`,
        anchor_text: "Blocked destination",
        http_status: status,
      }),
      bbox: null,
      viewport: "desktop",
    };

    render(
      <InspectorDetailPanel
        issue={issue}
        instances={[issue]}
        severity="error"
        aiOpen={false}
        onSelectInstance={vi.fn()}
        onReview={vi.fn()}
        onIgnore={vi.fn()}
        onToggleAI={vi.fn()}
        onCloseAI={vi.fn()}
      />,
    );

    const panel = screen.getByRole("complementary", { name: "Issue details" });
    expect(within(panel).getByText(`Blocked destination`)).toBeTruthy();
    expect(within(panel).getByText(new RegExp(`HTTP ${status}`))).toBeTruthy();
    expect(within(panel).getByText(/may be a false positive/i)).toBeTruthy();
    expect(within(panel).getByRole("link", { name: /Open in new tab/ })).toBeTruthy();
  });
});
