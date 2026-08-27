// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Inspector } from "./Inspector";
import * as api from "@/lib/api";

afterEach(() => cleanup());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/api", () => {
  return {
    CATEGORY_LABELS: {
      accessibility: "Accessibility",
      content: "Content",
      marketing: "Marketing",
      ux: "User Experience",
      privacy: "Privacy",
      policies: "Policies",
    },
    REPORT_CATEGORY_ORDER: ["content", "accessibility", "marketing", "ux", "privacy", "policies", "inventory"],
    artifactUrl: vi.fn(() => "/img"),
    createRetest: vi.fn(async () => ({ id: "job1", scan_id: "s1", url: "u", state: "queued", error: null, queued_at: null, rendering_at: null, auditing_at: null, finalizing_at: null, done_at: null, result: {} })),
    getRetestJob: vi.fn(async () => ({ id: "job1", scan_id: "s1", url: "u", state: "done", error: null, queued_at: null, rendering_at: null, auditing_at: null, finalizing_at: null, done_at: null, result: {} })),
    ignoreIssue: vi.fn(async () => ({ id: "i", ignored: true })),
    reviewIssue: vi.fn(async () => ({ id: "i", reviewed: true })),
    getPageDetail: vi.fn(async () => ({
      id: "p1",
      scan_id: "s1",
      url: "https://example.com/page",
      final_url: null,
      title: "Example page title",
      render_status: "done",
      is_error_page: false,
      is_document: false,
      score: 90,
      score_a: null,
      score_aa: null,
      score_aaa: null,
      category_scores: {
        Content: 74,
        Accessibility: 42,
        Marketing: 88,
        "User Experience": 81,
        Privacy: 55,
        Policies: null,
        Inventory: null,
      },
      issue_count: 2,
      manual_review_count: 0,
      word_count: 1240,
      reading_age: 12.1,
      render_ms: null,
      render_time_ms: 4200,
      status_code: 200,
      http_status: 200,
      last_scanned_at: "2026-07-31T14:05:00Z",
      issue_count_automated: 2,
      issue_count_manual: 0,
      dom_ref: null,
      screenshots: {
        desktop: { ref: "r1", css_width: 1000, dpr: 2, page_width_px: 2000, page_height_px: 3000 },
      },
      issues: [
        {
          id: "i1",
          rule_id: "broken_anchor_links",
          category: "accessibility",
          subcategory: null,
          impact: "serious",
          description: "Issue 1",
          remediation: "Fix it",
          reference_url: "",
          wcag_version: null,
          wcag_level: null,
          criterion_id: null,
          criterion_name: "Avoid linking to anchors that do not exist",
          is_best_practice: false,
          manual_review: false,
          reviewed: false,
          selector: ".x",
          html_snippet: null,
          bbox: { x: 10, y: 10, width: 100, height: 50 },
          viewport: "desktop",
        },
	        {
	          id: "i2",
          rule_id: "rule-2",
          category: "content",
          subcategory: null,
          impact: "moderate",
          description: "Issue 2",
          remediation: "Fix it",
          reference_url: "",
          wcag_version: null,
          wcag_level: null,
          criterion_id: null,
          criterion_name: "Broken link",
          is_best_practice: false,
          manual_review: false,
          reviewed: false,
          selector: ".y",
          html_snippet: null,
	          bbox: { x: 20, y: 1200, width: 120, height: 60 },
	          viewport: "desktop",
	        },
      ],
    })),
  };
});

describe("Inspector overlay", () => {
  it("renders Marketing and User Experience checks with exact section order", async () => {
    render(<Inspector scanId="s1" pageId="p1" />);
    const sidebar = await screen.findByRole("complementary", { name: "Page inspector sidebar" });
    const user = userEvent.setup();
    await user.click(within(sidebar).getByRole("button", { name: "More Marketing issues" }));
    const marketingSection = within(sidebar).getByRole("button", { name: "Marketing" }).closest("section")!;
    const marketingText = marketingSection.textContent ?? "";
    const marketingOrder = [
      "Technical optimization", "Add a structured sitemap for search engines",
      "Check and fix misspellings", "Ensure lists are marked up correctly",
      "Avoid file extensions for pages",
    ];
    marketingOrder.slice(1).forEach((label, index) => {
      expect(marketingText.indexOf(marketingOrder[index])).toBeLessThan(marketingText.indexOf(label));
    });

    const uxSection = within(sidebar).getByRole("button", { name: "User Experience" }).closest("section")!;
    const uxText = uxSection.textContent ?? "";
    expect(uxText.indexOf("Ensure pages don't scroll in two dimensions on small screens")).toBeLessThan(uxText.indexOf("Defer offscreen images"));
    expect(uxText.indexOf("Defer offscreen images")).toBeLessThan(uxText.indexOf("Fix missing images"));
  });

  it("renders Privacy and Policies checks in exact order with Information divider", async () => {
    render(<Inspector scanId="s1" pageId="p1" />);
    const sidebar = await screen.findByRole("complementary", { name: "Page inspector sidebar" });
    const user = userEvent.setup();
    await user.click(within(sidebar).getByRole("button", { name: "More Privacy issues" }));
    await user.click(within(sidebar).getByRole("button", { name: "More Policies issues" }));
    const privacy = within(sidebar).getByRole("button", { name: "Privacy" }).closest("section")!;
    const privacyText = privacy.textContent ?? "";
    const expected = [
      "Link every page to a privacy policy", "Enable enhanced privacy where possible",
      "Add a cookie disclaimer to every page", "Ensure cookies are only sent over SSL",
      "Specify a Content Security Policy for all pages", "Use Strict Transport Security for all pages",
      "Review privacy of technologies used",
    ];
    expected.slice(1).forEach((label, index) => {
      expect(privacyText.indexOf(expected[index])).toBeLessThan(privacyText.indexOf(label));
    });

    const policies = within(sidebar).getByRole("button", { name: "Policies" }).closest("section")!;
    const policiesText = policies.textContent ?? "";
    const policyOrder = [
      "Link every page to a privacy policy", "Add a cookie disclaimer to every page",
      "Sensitive keywords", "Find Forms and Applications",
    ];
    policyOrder.slice(1).forEach((label, index) => {
      expect(policiesText.indexOf(policyOrder[index])).toBeLessThan(policiesText.indexOf(label));
    });
  });

  it("renders the Silktide-style sidebar shell with ordered collapsible categories and pinned tabs", async () => {
    render(<Inspector scanId="s1" pageId="p1" />);

    const sidebar = await screen.findByRole("complementary", { name: "Page inspector sidebar" });
    expect(within(sidebar).getByText("Overall")).toBeTruthy();
    expect(within(sidebar).getByText("Score for this page")).toBeTruthy();
    expect(within(sidebar).getByRole("img", { name: "Score 90 percent" })).toBeTruthy();
    expect(within(sidebar).getByRole("img", { name: "Score 74 percent" })).toBeTruthy();
    expect(within(sidebar).getByRole("img", { name: "Score 42 percent" })).toBeTruthy();
    expect(within(sidebar).getByPlaceholderText("Search")).toBeTruthy();

    const sidebarText = sidebar.textContent ?? "";
    expect(sidebarText.indexOf("Content")).toBeLessThan(sidebarText.indexOf("Accessibility"));

    const user = userEvent.setup();
    await user.click(within(sidebar).getByRole("button", { name: "Accessibility" }));
    expect(within(sidebar).queryByRole("button", { name: "Avoid linking to anchors that do not exist" })).toBeNull();
    await user.click(within(sidebar).getByRole("button", { name: "Accessibility" }));
    expect(within(sidebar).getByRole("button", { name: "Avoid linking to anchors that do not exist" })).toBeTruthy();

    expect(within(sidebar).getByRole("button", { name: "issues" })).toBeTruthy();
    expect(within(sidebar).getByRole("button", { name: "info" })).toBeTruthy();

    await user.click(within(sidebar).getByRole("button", { name: "info" }));
    const infoPanel = within(sidebar).getByRole("region", { name: "Page information" });
    expect(within(infoPanel).getByText("Example page title")).toBeTruthy();
    expect(within(infoPanel).getByText("1,240 words")).toBeTruthy();
    expect(within(infoPanel).getByText("4,200 ms")).toBeTruthy();
    expect(within(infoPanel).getByText("200 OK")).toBeTruthy();
    expect(within(infoPanel).getByText("2 automated · 0 manual review")).toBeTruthy();
    await user.click(within(sidebar).getByRole("button", { name: "issues" }));
    expect(within(sidebar).getByRole("button", { name: "Avoid linking to anchors that do not exist" })).toBeTruthy();
  });

  it("deduplicates checks by category and rule_id, sorts groups, and renders instance cards", async () => {
    const issue = (overrides: Record<string, unknown>) => ({
      id: "base",
      rule_id: "base",
      display_name: "Base check",
      category: "content",
      subcategory: "Links",
      impact: "minor",
      description: "Issue detail",
      remediation: "Fix it",
      reference_url: "",
      wcag_version: null,
      wcag_level: null,
      criterion_id: null,
      criterion_name: null,
      is_best_practice: false,
      manual_review: false,
      reviewed: false,
      selector: null,
      html_snippet: null,
      bbox: null,
      viewport: "desktop",
      ...overrides,
    });

    (api.getPageDetail as any).mockResolvedValueOnce({
      id: "p1",
      scan_id: "s1",
      url: "https://example.com/page",
      final_url: null,
      render_status: "done",
      is_error_page: false,
      is_document: false,
      score: 82,
      score_a: null,
      score_aa: null,
      score_aaa: null,
      issue_count: 7,
      manual_review_count: 1,
      render_ms: 100,
      status_code: 200,
      dom_ref: null,
      screenshots: {},
      issues: [
        issue({ id: "b1", rule_id: "broken-links", display_name: "Check and fix broken links", impact: "serious", html_snippet: JSON.stringify({ url: "https://bad.example/one", http_status: 404 }) }),
        issue({ id: "b2", rule_id: "broken-links", display_name: "Check and fix broken links", impact: "moderate", html_snippet: JSON.stringify({ url: "https://bad.example/two", http_status: 500 }) }),
        issue({ id: "b3", rule_id: "broken-links", display_name: "Check and fix broken links", impact: "minor", html_snippet: JSON.stringify({ url: "https://bad.example/three" }) }),
        issue({ id: "w1", rule_id: "warning-check", display_name: "Warning check", impact: "moderate" }),
        issue({ id: "i1", rule_id: "info-check", display_name: "Info check one", impact: "minor" }),
        issue({ id: "i2", rule_id: "info-check", display_name: "Info check one", impact: "minor" }),
        issue({ id: "m1", rule_id: "manual-check", display_name: "Manual check", impact: null, manual_review: true }),
      ],
    });

    render(<Inspector scanId="s1" pageId="p1" />);
    const sidebar = await screen.findByRole("complementary", { name: "Page inspector sidebar" });
    expect(within(sidebar).getAllByRole("button", { name: /Check and fix broken links/i })).toHaveLength(1);

    const user = userEvent.setup();
    await user.click(within(sidebar).getByRole("button", { name: "More Content issues" }));
    const text = sidebar.textContent ?? "";
    expect(text.indexOf("Check and fix broken links")).toBeLessThan(text.indexOf("Warning check"));
    expect(text.indexOf("Warning check")).toBeLessThan(text.indexOf("Info check one"));
    expect(text.indexOf("Info check one")).toBeLessThan(text.indexOf("Manual check"));

    await user.click(within(sidebar).getByRole("button", { name: /Check and fix broken links/i }));
    expect(await screen.findByText("Instances (3)")).toBeTruthy();
    expect(screen.getAllByText("https://bad.example/one").length).toBeGreaterThan(0);
    expect(screen.getAllByText("https://bad.example/two").length).toBeGreaterThan(0);
    expect(screen.getAllByText("https://bad.example/three").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Ignore instance/i })).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "Ignore instance 1" }));
    await waitFor(() => expect(screen.getByText("Instances (2)")).toBeTruthy());
    expect(api.ignoreIssue).toHaveBeenCalledWith("b1");
  });

  it("matches the full sidebar ordering, filtering, truncation, score, and detail contract", async () => {
    const issue = (id: string, ruleId: string, displayName: string, category: string, overrides: Record<string, unknown> = {}) => ({
      id,
      rule_id: ruleId,
      display_name: displayName,
      check_description: `Catalog remediation for ${displayName}`,
      category,
      subcategory: "Checks",
      impact: "minor",
      description: displayName,
      remediation: "Legacy remediation",
      reference_url: "",
      wcag_version: null,
      wcag_level: null,
      criterion_id: null,
      criterion_name: null,
      is_best_practice: false,
      manual_review: false,
      reviewed: false,
      selector: null,
      html_snippet: null,
      bbox: null,
      viewport: "desktop",
      ...overrides,
    });
    const contentIssues = [
      issue("e1", "error-rule", "Error check", "content", { impact: "serious" }),
      issue("e2", "error-rule", "Error check", "content", { impact: "moderate" }),
      issue("w1", "warning-rule", "Warning check", "content", { impact: "moderate" }),
      issue("a1", "info-a", "Info A", "content"),
      issue("b1", "info-b", "Info B", "content"),
      issue("c1", "info-c", "Info C", "content"),
      issue("d1", "info-d", "Info D", "content"),
      issue("f1", "info-e", "Info E", "content"),
      issue("m1", "manual-rule", "Manual check", "content", { impact: null, manual_review: true }),
    ];
    (api.getPageDetail as any).mockResolvedValueOnce({
      id: "p-contract",
      scan_id: "s1",
      url: "https://example.com/contract",
      final_url: null,
      title: "Contract page",
      render_status: "ok",
      is_error_page: false,
      is_document: false,
      score: 76,
      score_a: 80,
      score_aa: 75,
      score_aaa: 70,
      category_scores: {
        Content: 61,
        Accessibility: 92,
        Marketing: 87,
        "User Experience": 81,
        Privacy: 55,
        Policies: null,
        Inventory: null,
      },
      issue_count: 15,
      manual_review_count: 2,
      render_ms: 100,
      status_code: 200,
      dom_ref: null,
      screenshots: {},
      issues: [
        ...contentIssues,
        issue("acc", "broken_anchor_links", "Avoid linking to anchors that do not exist", "accessibility", {
          impact: "serious",
          subcategory: "Links",
          wcag_version: "2.0",
          wcag_level: "A",
          criterion_id: "2.4.1",
        }),
        issue("seo", "seo-rule", "Marketing unique", "marketing"),
        issue("ux", "ux-rule", "UX unique", "ux"),
        issue("privacy", "phone_numbers_exposed", "Review publicly visible phone numbers", "privacy"),
        issue("policy", "forms_inventory", "Find Forms and Applications", "policies", { manual_review: true, impact: null }),
        issue("inventory", "technology", "Inventory technology", "inventory"),
      ],
    });

    render(<Inspector scanId="s1" pageId="p-contract" />);
    const sidebar = await screen.findByRole("complementary", { name: "Page inspector sidebar" });
    const user = userEvent.setup();
    expect(within(sidebar).queryByRole("button", { name: "Info E" })).toBeNull();
    expect(within(sidebar).getByRole("button", { name: "More Content issues" })).toBeTruthy();
    await user.click(within(sidebar).getByRole("button", { name: "More Content issues" }));
    const sidebarText = sidebar.textContent ?? "";
    const categoryNames = ["Content", "Accessibility", "Marketing", "User Experience", "Privacy", "Policies"];
    categoryNames.slice(1).forEach((name, index) => {
      expect(sidebarText.indexOf(categoryNames[index])).toBeLessThan(sidebarText.indexOf(name));
    });
    expect(sidebarText).toContain("Inventory technology");
    expect(sidebarText).not.toContain("Empty Category");
    expect(within(sidebar).getAllByRole("button", { name: "Error check" })).toHaveLength(1);
    expect(sidebarText.indexOf("Error check")).toBeLessThan(sidebarText.indexOf("Warning check"));
    expect(sidebarText.indexOf("Warning check")).toBeLessThan(sidebarText.indexOf("Info A"));
    expect(sidebarText.indexOf("Info E")).toBeLessThan(sidebarText.indexOf("Manual check"));
    expect(within(sidebar).queryByText("WCAG 2.0 A 4.1.1")).toBeNull();
    expect(within(sidebar).getByRole("img", { name: "Score 61 percent" })).toBeTruthy();
    expect(within(sidebar).getByRole("img", { name: "Score 92 percent" })).toBeTruthy();
    expect(within(within(sidebar).getByRole("button", { name: "Policies" })).queryByRole("img")).toBeNull();

    expect(within(sidebar).getByRole("button", { name: "Info E" })).toBeTruthy();
    await user.click(within(sidebar).getByRole("button", { name: "Less Content issues" }));
    expect(within(sidebar).queryByRole("button", { name: "Info E" })).toBeNull();
    await user.click(within(sidebar).getByRole("button", { name: "More Content issues" }));

    const search = within(sidebar).getByRole("textbox", { name: "Search checks" });
    await user.type(search, "technologies used");
    expect(within(sidebar).getByRole("button", { name: "Review privacy of technologies used" })).toBeTruthy();
    expect(within(sidebar).queryByRole("button", { name: "Marketing unique" })).toBeNull();
    await user.clear(search);

    await user.click(within(sidebar).getByRole("button", { name: "Avoid linking to anchors that do not exist" }));
    let detail = screen.getByRole("complementary", { name: "Issue details" });
    expect(within(detail).getByText("WCAG 2.0 A 2.4.1")).toBeTruthy();
    expect(within(detail).getByText("Serious")).toBeTruthy();
    expect(within(detail).queryByText("Manual review")).toBeNull();
    expect(within(detail).queryByRole("button", { name: "Mark as reviewed" })).toBeNull();
    expect(within(detail).getByRole("button", { name: "✦ Ask AI about this issue" })).toBeTruthy();

    await user.click(within(detail).getByRole("button", { name: "Back to all issues" }));
    await user.click(within(sidebar).getByRole("button", { name: "Warning check" }));
    detail = screen.getByRole("complementary", { name: "Issue details" });
    expect(within(detail).getByText("Moderate")).toBeTruthy();
    await user.click(within(detail).getByRole("button", { name: "Back to all issues" }));
    await user.click(within(sidebar).getByRole("button", { name: "Info A" }));
    detail = screen.getByRole("complementary", { name: "Issue details" });
    expect(within(detail).getByText("Minor")).toBeTruthy();
    await user.click(within(detail).getByRole("button", { name: "Back to all issues" }));
    await user.click(within(sidebar).getByRole("button", { name: "Manual check" }));
    detail = screen.getByRole("complementary", { name: "Issue details" });
    expect(within(detail).getByText("Manual review")).toBeTruthy();
    expect(within(detail).getByRole("button", { name: "Mark as reviewed" })).toBeTruthy();
    expect(within(detail).getByText("Catalog remediation for Manual check")).toBeTruthy();
  });

  it("updates category score rings when page category_scores change", async () => {
    const payload = (pageId: string, contentScore: number) => ({
      id: pageId,
      scan_id: "s1",
      url: `https://example.com/${pageId}`,
      final_url: null,
      title: "Score page",
      render_status: "ok",
      is_error_page: false,
      is_document: false,
      score: 80,
      score_a: null,
      score_aa: null,
      score_aaa: null,
      category_scores: { Content: contentScore },
      issue_count: 1,
      manual_review_count: 0,
      render_ms: 10,
      status_code: 200,
      dom_ref: null,
      screenshots: {},
      issues: [{
        id: `${pageId}-issue`, rule_id: "content-rule", display_name: "Content check",
        check_description: "Fix content", category: "content", subcategory: "Writing",
        impact: "minor", description: "Content issue", remediation: "Fix content",
        reference_url: "", wcag_version: null, wcag_level: null, criterion_id: null,
        criterion_name: null, is_best_practice: false, manual_review: false, reviewed: false,
        selector: null, html_snippet: null, bbox: null, viewport: "desktop",
      }],
    });
    (api.getPageDetail as any)
      .mockResolvedValueOnce(payload("p1", 45))
      .mockResolvedValueOnce(payload("p2", 91));

    const view = render(<Inspector scanId="s1" pageId="p1" />);
    const sidebar = await screen.findByRole("complementary", { name: "Page inspector sidebar" });
    expect(within(sidebar).getByRole("img", { name: "Score 45 percent" })).toBeTruthy();
    view.rerender(<Inspector scanId="s1" pageId="p2" />);
    await waitFor(() => expect(within(sidebar).getByRole("img", { name: "Score 91 percent" })).toBeTruthy());
    expect(within(sidebar).queryByRole("img", { name: "Score 45 percent" })).toBeNull();
  });

  it("renders a broken-link detail panel from html_snippet JSON", async () => {
    globalThis.requestAnimationFrame = (cb: any) => (cb(0), 0);

    (api.getPageDetail as any).mockResolvedValueOnce({
      id: "p1",
      scan_id: "s1",
      url: "https://example.com/page",
      final_url: null,
      render_status: "done",
      is_error_page: false,
      is_document: false,
      score: 90,
      score_a: null,
      score_aa: null,
      score_aaa: null,
      issue_count: 1,
      manual_review_count: 0,
      render_ms: null,
      status_code: 200,
      dom_ref: null,
      screenshots: {
        desktop: { ref: "r1", css_width: 1000, dpr: 1, page_width_px: 1000, page_height_px: 1000 },
      },
      issues: [
        {
          id: "i1",
          rule_id: "broken-links",
          display_name: "Check and fix broken links",
          check_description: "Review broken destinations and update each link.",
          category: "content",
          subcategory: "Links",
          impact: "serious",
          description: "Broken link (HTTP 404)",
          remediation: "Fix it",
          reference_url: "",
          wcag_version: null,
          wcag_level: null,
          criterion_id: null,
          criterion_name: null,
          is_best_practice: false,
          manual_review: false,
          reviewed: false,
          selector: "a.nav-link",
          html_snippet: JSON.stringify({
            url: "https://broken.example.com",
            anchor_text: "Student Organizations",
            http_status: 404,
            error_type: "HTTP 404",
            selector: "a.nav-link",
            occurrence_count: 2,
            all_selectors: ["a.nav-link", "footer a.nav-link"],
          }),
          bbox: { x: 10, y: 10, width: 100, height: 20 },
          viewport: "desktop",
        },
      ],
    });

    render(<Inspector scanId="s1" pageId="p1" />);
    await screen.findByText("https://example.com/page");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Check and fix broken links/i }));

    const detail = await screen.findByRole("complementary", { name: "Issue details" });
    expect(within(detail).getByText("Serious")).toBeTruthy();
    expect(within(detail).getByRole("heading", { name: "Check and fix broken links" })).toBeTruthy();
    expect(within(detail).getByText("Content · Links")).toBeTruthy();
    expect(within(detail).getByText("Review broken destinations and update each link.")).toBeTruthy();
    expect(within(detail).getAllByText("https://broken.example.com").length).toBeGreaterThan(0);
    expect(within(detail).getByText("Student Organizations")).toBeTruthy();
    expect(within(detail).getByText(/HTTP 404/)).toBeTruthy();
    expect(within(detail).getByText(/Page not found/)).toBeTruthy();
    const openLink = within(detail).getByRole("link", { name: /Open in new tab/ });
    expect(openLink.getAttribute("href")).toBe("https://broken.example.com");
    expect(openLink.getAttribute("target")).toBe("_blank");
    expect(within(detail).getByText("a.nav-link")).toBeTruthy();
    expect(within(detail).queryByText(/anchor_text/)).toBeNull();
  });

  it("scales bbox Y using the screenshot's natural aspect ratio when available", async () => {
    globalThis.requestAnimationFrame = (cb: any) => (cb(0), 0);

    (api.getPageDetail as any).mockResolvedValueOnce({
      id: "p1",
      scan_id: "s1",
      url: "https://example.com/page",
      final_url: null,
      render_status: "done",
      is_error_page: false,
      is_document: false,
      score: 90,
      score_a: null,
      score_aa: null,
      score_aaa: null,
      issue_count: 1,
      manual_review_count: 0,
      render_ms: null,
      status_code: 200,
      dom_ref: null,
      screenshots: {
        desktop: { ref: "r1", css_width: 1000, dpr: 1, page_width_px: 1000, page_height_px: 99999 },
      },
      issues: [
        {
          id: "i1",
          rule_id: "broken_anchor_links",
          category: "accessibility",
          subcategory: null,
          impact: "serious",
          description: "Issue 1",
          remediation: "Fix it",
          reference_url: "",
          wcag_version: null,
          wcag_level: null,
          criterion_id: null,
          criterion_name: "Avoid linking to anchors that do not exist",
          is_best_practice: false,
          manual_review: false,
          reviewed: false,
          selector: ".x",
          html_snippet: null,
          bbox: { x: 0, y: 4000, width: 10, height: 10 },
          viewport: "desktop",
        },
      ],
    });

    render(<Inspector scanId="s1" pageId="p1" />);
    await screen.findByText("https://example.com/page");

    const pane = await screen.findByRole("main");
    Object.defineProperty(pane, "clientHeight", { value: 2000, configurable: true });
    pane.scrollTo = vi.fn();
    pane.scrollTop = 0;

    const wrap = await screen.findByTestId("screenshot-wrap");
    Object.defineProperty(wrap, "offsetTop", { value: 0, configurable: true });

    const img = (await screen.findByAltText("Rendered page")) as HTMLImageElement;
    Object.defineProperty(img, "clientWidth", { value: 500, configurable: true });
    Object.defineProperty(img, "clientHeight", { value: 600, configurable: true });
    Object.defineProperty(img, "naturalWidth", { value: 1000, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 8000, configurable: true });
    img.dispatchEvent(new Event("load"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Avoid linking to anchors that do not exist/i }));

    const box = await screen.findByTestId("issue-bbox");
    expect(box.style.top).toBe("300px");
  });

  it("shows no boxes by default; toggles single box on issue click", async () => {
    globalThis.requestAnimationFrame = (cb: any) => (cb(0), 0);

    render(<Inspector scanId="s1" pageId="p1" />);

    expect(await screen.findByText("https://example.com/page")).toBeTruthy();
    expect(screen.queryAllByTestId("issue-bbox")).toHaveLength(0);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Avoid linking to anchors that do not exist/i }));
    await waitFor(() => expect(screen.getAllByTestId("issue-bbox")).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Back to all issues" }));
    await waitFor(() => expect(screen.queryAllByTestId("issue-bbox")).toHaveLength(0));

    await user.click(screen.getByRole("button", { name: /Broken link/i }));
    await waitFor(() => expect(screen.getAllByTestId("issue-bbox")).toHaveLength(1));
  });

  it("opens focused on the issue named in the URL, highlighting it", async () => {
    // Arriving from a check list means "show me this finding", so the issue is
    // selected and outlined on load rather than waiting for a second click.
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => (cb(0), 0)) as typeof requestAnimationFrame;

    render(<Inspector scanId="s1" pageId="p1" focusIssueId="i1" />);

    expect(await screen.findByAltText("Rendered page")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId("issue-bbox")).toHaveLength(1));
  });

  it("leaves the screenshot plain when no issue is named in the URL", async () => {
    render(<Inspector scanId="s1" pageId="p1" />);

    expect(await screen.findByAltText("Rendered page")).toBeTruthy();
    expect(screen.queryAllByTestId("issue-bbox")).toHaveLength(0);
  });

  it("auto-scrolls the screenshot pane when the selected box is out of view", async () => {
    globalThis.requestAnimationFrame = (cb: any) => (cb(0), 0);

    render(<Inspector scanId="s1" pageId="p1" />);

    const pane = await screen.findByRole("main");
    Object.defineProperty(pane, "clientHeight", { value: 200, configurable: true });
    pane.scrollTo = vi.fn();
    pane.scrollTop = 0;

    const wrap = await screen.findByTestId("screenshot-wrap");
    Object.defineProperty(wrap, "offsetTop", { value: 0, configurable: true });

    const img = (await screen.findByAltText("Rendered page")) as HTMLImageElement;
    Object.defineProperty(img, "clientWidth", { value: 500, configurable: true });
    Object.defineProperty(img, "clientHeight", { value: 750, configurable: true });
    img.dispatchEvent(new Event("load"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Broken link/i }));

    await waitFor(() => expect((pane.scrollTo as any).mock.calls.length).toBeGreaterThan(0));
    const arg = (pane.scrollTo as any).mock.calls[0][0];
    expect(arg.top).toBeGreaterThan(0);
  });

  it("shows a fallback message when the selected issue has no bbox", async () => {
    globalThis.requestAnimationFrame = (cb: any) => (cb(0), 0);

    (api.getPageDetail as any).mockResolvedValueOnce({
      id: "p1",
      scan_id: "s1",
      url: "https://example.com/page",
      final_url: null,
      render_status: "done",
      is_error_page: false,
      is_document: false,
      score: 90,
      score_a: null,
      score_aa: null,
      score_aaa: null,
      issue_count: 1,
      manual_review_count: 0,
      render_ms: null,
      status_code: 200,
      dom_ref: null,
      screenshots: {
        desktop: { ref: "r1", css_width: 1000, dpr: 2, page_width_px: 2000, page_height_px: 3000 },
      },
      issues: [
        {
          id: "i1",
          rule_id: "broken_anchor_links",
          category: "accessibility",
          subcategory: null,
          impact: "serious",
          description: "Page-level issue",
          remediation: "Fix it",
          reference_url: "",
          wcag_version: null,
          wcag_level: null,
          criterion_id: null,
          criterion_name: "Avoid linking to anchors that do not exist",
          is_best_practice: false,
          manual_review: false,
          reviewed: false,
          selector: null,
          html_snippet: null,
          bbox: null,
          viewport: "desktop",
        },
      ],
    });

    render(<Inspector scanId="s1" pageId="p1" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Avoid linking to anchors that do not exist/i }));
    expect(await screen.findByRole("heading", { name: "Avoid linking to anchors that do not exist" })).toBeTruthy();
    expect(screen.getByText(/affects the whole page/i)).toBeTruthy();
    expect(screen.queryAllByTestId("issue-bbox")).toHaveLength(0);
  });

  it("shows screenshot placeholder when no screenshots exist", async () => {
    globalThis.requestAnimationFrame = (cb: any) => (cb(0), 0);

    (api.getPageDetail as any).mockResolvedValueOnce({
      id: "p1",
      scan_id: "s1",
      url: "https://example.com/page",
      final_url: null,
      render_status: "done",
      is_error_page: false,
      is_document: false,
      score: 90,
      score_a: null,
      score_aa: null,
      score_aaa: null,
      issue_count: 1,
      manual_review_count: 0,
      render_ms: null,
      status_code: 200,
      dom_ref: null,
      screenshots: {},
      issues: [
        {
          id: "i1",
          rule_id: "broken_anchor_links",
          category: "accessibility",
          subcategory: null,
          impact: "serious",
          description: "Issue 1",
          remediation: "Fix it",
          reference_url: "",
          wcag_version: null,
          wcag_level: null,
          criterion_id: null,
          criterion_name: "Avoid linking to anchors that do not exist",
          is_best_practice: false,
          manual_review: false,
          reviewed: false,
          selector: ".x",
          html_snippet: null,
          bbox: { x: 10, y: 10, width: 100, height: 50 },
          viewport: "desktop",
        },
      ],
    });

    render(<Inspector scanId="s1" pageId="p1" />);
    expect(await screen.findByTestId("screenshot-placeholder")).toBeTruthy();
    expect(screen.getByText(/Avoid linking to anchors that do not exist/)).toBeTruthy();
  });

  it("falls back to screenshot placeholder when the image fails to load", async () => {
    globalThis.requestAnimationFrame = (cb: any) => (cb(0), 0);

    render(<Inspector scanId="s1" pageId="p1" />);
    const img = await screen.findByAltText("Rendered page");
    img.dispatchEvent(new Event("error"));
    expect(await screen.findByTestId("screenshot-placeholder")).toBeTruthy();
  });

  it("filters issues by check name via search box", async () => {
    globalThis.requestAnimationFrame = (cb: any) => (cb(0), 0);

    render(<Inspector scanId="s1" pageId="p1" />);
    await screen.findByText("https://example.com/page");

    const input = screen.getByLabelText("Search checks");
    const user = userEvent.setup();
    await user.type(input, "broken");

    expect(screen.queryByText(/Ensure lists are marked up correctly/i)).toBeNull();
    expect(screen.getAllByText(/Broken link/i).length).toBeGreaterThan(0);
  });

  it("keeps selection on viewport switch but hides highlight when not available", async () => {
    globalThis.requestAnimationFrame = (cb: any) => (cb(0), 0);

    const payload = {
      id: "p1",
      scan_id: "s1",
      url: "https://example.com/page",
      final_url: null,
      render_status: "done",
      is_error_page: false,
      is_document: false,
      score: 90,
      score_a: null,
      score_aa: null,
      score_aaa: null,
      issue_count: 1,
      manual_review_count: 0,
      render_ms: null,
      status_code: 200,
      dom_ref: null,
      screenshots: {
        desktop: { ref: "r1", css_width: 1000, dpr: 2, page_width_px: 2000, page_height_px: 3000 },
        mobile: { ref: "r2", css_width: 390, dpr: 2, page_width_px: 780, page_height_px: 3000 },
      },
      issues: [
        {
          id: "i1",
          rule_id: "broken_anchor_links",
          category: "accessibility",
          subcategory: null,
          impact: "serious",
          description: "Issue 1",
          remediation: "Fix it",
          reference_url: "",
          wcag_version: null,
          wcag_level: null,
          criterion_id: null,
          criterion_name: "Avoid linking to anchors that do not exist",
          is_best_practice: false,
          manual_review: false,
          reviewed: false,
          selector: ".x",
          html_snippet: null,
          bbox: { x: 10, y: 10, width: 100, height: 50 },
          viewport: "desktop",
        },
      ],
    };

    (api.getPageDetail as any).mockResolvedValueOnce(payload).mockResolvedValueOnce(payload);

    render(<Inspector scanId="s1" pageId="p1" />);
    await screen.findByText("https://example.com/page");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Avoid linking to anchors that do not exist/i }));
    await waitFor(() => expect(screen.getAllByTestId("issue-bbox")).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: /Mobile/i }));
    await waitFor(() => expect(screen.queryAllByTestId("issue-bbox")).toHaveLength(0));
    expect(screen.getByRole("heading", { name: "Avoid linking to anchors that do not exist" })).toBeTruthy();
  });

  it("shows PDF placeholder when page is a document", async () => {
    globalThis.requestAnimationFrame = (cb: any) => (cb(0), 0);

    (api.getPageDetail as any).mockResolvedValueOnce({
      id: "p1",
      scan_id: "s1",
      url: "https://example.com/file.pdf",
      final_url: null,
      render_status: "done",
      is_error_page: false,
      is_document: true,
      score: 90,
      score_a: null,
      score_aa: null,
      score_aaa: null,
      issue_count: 1,
      manual_review_count: 0,
      render_ms: null,
      status_code: 200,
      dom_ref: null,
      screenshots: {},
      issues: [
        {
          id: "i1",
          rule_id: "broken_anchor_links",
          category: "accessibility",
          subcategory: null,
          impact: "serious",
          description: "Issue 1",
          remediation: "Fix it",
          reference_url: "",
          wcag_version: null,
          wcag_level: null,
          criterion_id: null,
          criterion_name: "Avoid linking to anchors that do not exist",
          is_best_practice: false,
          manual_review: false,
          reviewed: false,
          selector: null,
          html_snippet: null,
          bbox: null,
          viewport: null,
        },
      ],
    });

    render(<Inspector scanId="s1" pageId="p1" />);
    const placeholder = await screen.findByTestId("pdf-placeholder");
    expect(within(placeholder).getByText(/^PDF document$/)).toBeTruthy();
    expect(within(placeholder).getByRole("link", { name: /Open PDF/i })).toBeTruthy();
  });
});
