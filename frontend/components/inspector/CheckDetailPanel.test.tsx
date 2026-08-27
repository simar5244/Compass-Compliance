// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CheckDetailPanel } from "./CheckDetailPanel";
import type { IssueOut } from "@/lib/api";

afterEach(() => cleanup());

const PAGE_URL = "https://example.com/page";

function renderPanel(issue: IssueOut, instances: IssueOut[] = [issue]) {
  render(
    <CheckDetailPanel
      issue={issue}
      ruleId={issue.rule_id}
      instances={instances}
      pageUrl={PAGE_URL}
      pageThumbnailUrl="https://cdn.example/shot.png"
      onSelectInstance={vi.fn()}
      onAskAIInstance={vi.fn()}
      onBack={vi.fn()}
    />,
  );
  return screen.getByRole("complementary", { name: "Issue details" });
}

describe("CheckDetailPanel", () => {
  it("renders title, WCAG line, description and the Issues list in Silktide order", () => {
    const issue: IssueOut = {
      id: "manual-1",
      rule_id: "lists_markup",
      display_name: "Ensure lists are marked up correctly",
      check_description: "Use list elements so relationships are available to assistive technology.",
      category: "accessibility",
      subcategory: "WCAG",
      impact: "minor",
      description: "Not allowed inside a <ul> tag",
      remediation: "Move this element outside the list.",
      reference_url: "",
      wcag_version: "2.0",
      wcag_level: "A",
      criterion_id: "4.1.1",
      criterion_name: "Parsing",
      is_best_practice: false,
      manual_review: false,
      reviewed: false,
      selector: "#element-id",
      html_snippet: JSON.stringify({ html: '<div class="l-ttunav is-hidden">' }),
      bbox: { x: 1, y: 2, width: 3, height: 4 },
      viewport: "desktop",
    };

    const panel = renderPanel(issue);

    expect(within(panel).getByRole("heading", { name: issue.display_name })).toBeTruthy();
    expect(within(panel).getByText("WCAG 2.0 A 4.1.1")).toBeTruthy();
    expect(within(panel).getByText("Issues")).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Not allowed inside a <ul> tag" })).toBeTruthy();

    // Silktide drops per-issue review/ignore actions from this panel.
    expect(within(panel).queryByRole("button", { name: /Mark as reviewed/ })).toBeNull();
    expect(within(panel).queryByRole("button", { name: /Ignore/ })).toBeNull();
  });

  it("clamps a long description behind Show more and renders markup as code chips", async () => {
    const issue = {
      id: "d1", rule_id: "lists_markup", display_name: "Ensure lists are marked up correctly",
      check_description:
        "Lists (e.g. <ul> or <ol>) should only contain list items (<li>) as a direct descendant to ensure that screen readers can accurately report the amount of items contained in the list.",
      category: "accessibility", subcategory: "WCAG", impact: "minor",
      description: "Not allowed inside a <ul> tag", remediation: "Move it out.",
      reference_url: "", wcag_version: "2.0", wcag_level: "A", criterion_id: "4.1.1", criterion_name: "Parsing",
      is_best_practice: false, manual_review: false, reviewed: false, selector: "#x",
      html_snippet: null, bbox: null, viewport: "desktop",
    } as IssueOut;

    const panel = renderPanel(issue);
    expect(within(panel).queryByText(/amount of items contained in the list/)).toBeNull();
    // Inline tags render as code chips rather than being swallowed as markup.
    expect(within(panel).getAllByText("<ul>").length).toBeGreaterThan(0);

    await userEvent.click(within(panel).getByRole("button", { name: "Show more" }));
    expect(within(panel).getByRole("button", { name: "Show less" })).toBeTruthy();
    expect(within(panel).getByText(/amount of items contained in the list/)).toBeTruthy();
  });

  it("omits the WCAG line for checks with no criterion", () => {
    const issue = {
      id: "p1", rule_id: "privacy-policy-link", display_name: "Link every page to a privacy policy",
      check_description: "All pages should clearly link to a privacy policy page.",
      category: "privacy", subcategory: "Audit", impact: "serious",
      description: "No privacy policy link found on this page.", remediation: "Add a link.",
      reference_url: "", wcag_version: null, wcag_level: null, criterion_id: null, criterion_name: null,
      is_best_practice: false, manual_review: false, reviewed: false, selector: null,
      html_snippet: null, bbox: null, viewport: null,
    } as IssueOut;

    const panel = renderPanel(issue);
    expect(within(panel).queryByText(/^WCAG/)).toBeNull();
    expect(within(panel).getByRole("button", { name: "Whole HTML page" })).toBeTruthy();
  });

  it.each([403, 999])("surfaces HTTP %i link results as possible false positives", async (status) => {
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

    const panel = renderPanel(issue);
    // The first instance is expanded on open, so its body is already visible.
    expect(within(panel).getByRole("button", { name: "Broken link" }).getAttribute("aria-expanded")).toBe("true");
    expect(within(panel).getByText(new RegExp(`HTTP ${status}`))).toBeTruthy();
    expect(within(panel).getByText(/verify this one in a browser/i)).toBeTruthy();
  });
});
