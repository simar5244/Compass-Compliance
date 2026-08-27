// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IssueOut } from "@/lib/api";
import { InstanceAccordion } from "./InstanceAccordion";
import { buildInstances } from "./instances";

afterEach(() => cleanup());

const PAGE_URL = "https://example.com/page";

function issue(overrides: Partial<IssueOut> & { id: string }): IssueOut {
  return {
    rule_id: "sensitive_keywords", display_name: "Sensitive keywords",
    check_description: "Review the keyword in context.", category: "content", subcategory: "Keywords",
    impact: "minor", description: "Sensitive keyword", remediation: "Review it.",
    reference_url: "", wcag_version: null, wcag_level: null, criterion_id: null, criterion_name: null,
    is_best_practice: false, manual_review: true, reviewed: false, selector: null,
    html_snippet: null, bbox: null, viewport: "desktop",
    ...overrides,
  } as IssueOut;
}

function keyword(id: string, word: string, y: number): IssueOut {
  return issue({
    id,
    description: `Sensitive keyword: ${word}`,
    selector: `#word-${id}`,
    html_snippet: JSON.stringify({ matched_text: word, context: `Context for ${word}` }),
    bbox: { x: 10, y, width: 50, height: 14 },
  });
}

function renderList(issues: IssueOut[], expandedKey: string | null, overrides: Record<string, unknown> = {}) {
  const rows = buildInstances(issues, PAGE_URL);
  render(
    <InstanceAccordion
      instances={rows}
      expandedKey={expandedKey}
      onToggle={vi.fn()}
      onSelectOccurrence={vi.fn()}
      onAskAI={vi.fn()}
      pageThumbnailUrl="https://cdn.example/shot.png"
      {...overrides}
    />,
  );
  return rows;
}

describe("InstanceAccordion", () => {
  it("keeps engine order and only expands the selected row", () => {
    const issues = [keyword("1", "first term", 20), keyword("2", "second term", 60), keyword("3", "third term", 100)];
    const rows = renderList(issues, null);

    expect(rows.map((row) => row.label)).toEqual([
      "Sensitive keyword: first term",
      "Sensitive keyword: second term",
      "Sensitive keyword: third term",
    ]);
    expect(screen.getAllByRole("button", { name: /Sensitive keyword/ })).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /Ask AI about/ })).toBeNull();

    cleanup();
    renderList(issues, rows[1].key);
    expect(screen.getAllByRole("button", { name: /Ask AI about/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Ask AI about Sensitive keyword: second term" })).toBeTruthy();
  });

  it("collapses identical findings into one row with a count badge and a pager", async () => {
    const repeated = ["a", "b", "c"].map((id) =>
      issue({
        id,
        rule_id: "broken_anchor_links",
        description: "Anchor target does not exist",
        selector: "a.back",
        html_snippet: JSON.stringify({ html: '<a href="#0">Back</a>' }),
        bbox: { x: 0, y: 0, width: 10, height: 10 },
      }),
    );
    const onSelectOccurrence = vi.fn();
    const rows = renderList(repeated, null, { onSelectOccurrence });

    expect(rows).toHaveLength(1);
    expect(rows[0].occurrences).toHaveLength(3);
    expect(screen.getByLabelText("3 occurrences").textContent).toBe("3");

    cleanup();
    renderList(repeated, rows[0].key, { onSelectOccurrence });
    expect(screen.getByText("1 of 3")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Next occurrence" }));
    expect(screen.getByText("2 of 3")).toBeTruthy();
    expect(onSelectOccurrence).toHaveBeenCalledWith(repeated[1]);
  });

  it("renders page-level findings as a whole-page row with the page thumbnail", () => {
    const pageLevel = issue({
      id: "p",
      rule_id: "privacy-policy-link",
      description: "No privacy policy link found on this page.",
      selector: null,
      bbox: null,
    });
    const rows = renderList([pageLevel], null);
    expect(rows[0].kind).toBe("page");
    expect(screen.getByRole("button", { name: "Whole HTML page" })).toBeTruthy();

    cleanup();
    renderList([pageLevel], rows[0].key);
    expect(screen.getByTestId("page-thumbnail").getAttribute("src")).toBe("https://cdn.example/shot.png");
    expect(screen.getByText("No privacy policy link found on this page.")).toBeTruthy();
  });

  it("expands an array payload into one media row per entry, resolved against the page URL", () => {
    const favicons = issue({
      id: "f",
      rule_id: "favicon_review",
      description: "Review favicons for brand compliance",
      html_snippet: JSON.stringify({
        favicons: [
          { rel: "icon", href: "/favicon-96.png", type: "image/png" },
          { rel: "icon", href: "https://cdn.example.com/assets/favicon.svg", type: "image/svg+xml" },
        ],
      }),
    });
    const rows = renderList([favicons], null);

    expect(rows.map((row) => row.label)).toEqual(["favicon-96.png", "favicon.svg"]);
    expect(rows.map((row) => row.imageUrl)).toEqual([
      "https://example.com/favicon-96.png",
      "https://cdn.example.com/assets/favicon.svg",
    ]);
    expect(screen.getByRole("button", { name: "favicon-96.png" })).toBeTruthy();
  });
});
