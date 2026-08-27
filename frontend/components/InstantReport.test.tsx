import { describe, expect, it } from "vitest";
import type { IssueOut } from "@/lib/api";
import { highlightedIssues } from "./InstantReport";
import { ACCESSIBILITY_CHECKS, MARKETING_CHECKS, UX_CHECKS, PRIVACY_CHECKS, POLICIES_CHECKS } from "@/lib/report";

const issues = [
  {
    id: "one",
    category: "accessibility",
    rule_id: "focus-visible",
    viewport: "desktop",
    bbox: { x: 1, y: 2, width: 3, height: 4 },
  },
  {
    id: "two",
    category: "accessibility",
    rule_id: "listitem",
    viewport: "desktop",
    bbox: { x: 5, y: 6, width: 7, height: 8 },
  },
] as IssueOut[];

describe("instant report screenshot highlights", () => {
  it("starts with the specified accessibility checks in the requested order", () => {
    expect(ACCESSIBILITY_CHECKS).toHaveLength(33);
    expect(ACCESSIBILITY_CHECKS.slice(0, 6).map((check) => check.title)).toEqual([
      "Ensure pages don't scroll in two dimensions on small screens",
      "Ensure lists are marked up correctly",
      "Avoid linking to anchors that do not exist",
      "Ensure links explain their purpose",
      "Ensure pages don't require zooming and 2D scrolling on small screens",
      "Ensure controls clearly indicate when they are selected",
    ]);
    expect(ACCESSIBILITY_CHECKS.at(-1)!.title).toBe("Ensure long PDFs use bookmarks to aid navigation");
  });

  it("defines Marketing and User Experience checks in the requested UI order", () => {
    expect(MARKETING_CHECKS).toHaveLength(16);
    expect(MARKETING_CHECKS.slice(0, 5).map((check) => check.title)).toEqual([
      "Add a structured sitemap for search engines",
      "Check and fix misspellings",
      "Ensure lists are marked up correctly",
      "Avoid file extensions for pages",
      "Consider optimizing images",
    ]);
    expect(MARKETING_CHECKS.at(-1)!.title).toBe("Avoid underscores in URLs");
    expect(UX_CHECKS).toHaveLength(25);
    expect(UX_CHECKS.slice(0, 3).map((check) => check.title)).toEqual([
      "Ensure pages don't scroll in two dimensions on small screens",
      "Defer offscreen images",
      "Fix missing images",
    ]);
    expect(UX_CHECKS.at(-1)!.title).toBe("Keep server response times short");
    expect(MARKETING_CHECKS.filter((check) => "sectionLabel" in check)
      .map((check) => (check as { sectionLabel: string }).sectionLabel))
      .toEqual(["Technical optimization"]);
  });
  it("defines Privacy and Policies checks in the requested UI order", () => {
    expect(PRIVACY_CHECKS.map((check) => check.title)).toEqual([
      "Link every page to a privacy policy",
      "Enable enhanced privacy where possible",
      "Add a cookie disclaimer to every page",
      "Ensure cookies are only sent over SSL",
      "Specify a Content Security Policy for all pages",
      "Use Strict Transport Security for all pages",
      "Review privacy of technologies used",
    ]);
    expect(POLICIES_CHECKS.map((check) => check.title)).toEqual([
      "Link every page to a privacy policy",
      "Add a cookie disclaimer to every page",
      "Sensitive keywords",
      "Texas Senate Bill 17",
      'Find "accessibility"',
      "Identify Pages using EEO terms",
      "Identify Pages using Affirmative Action terms",
      "Find Forms and Applications",
    ]);
  });
  it("shows a plain screenshot until a check is selected", () => {
    expect(highlightedIssues(issues, null, "desktop")).toEqual([]);
  });

  it("shows only the selected check's boxes", () => {
    expect(highlightedIssues(issues, "accessibility:focus-visible", "desktop")).toEqual([issues[0]]);
  });
});
