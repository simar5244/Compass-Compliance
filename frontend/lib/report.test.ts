import { describe, it, expect } from "vitest";
import { CONTENT_CHECKS, CONTENT_CHECK_ORDER, contentCheckRank, contentCheckTitle, severityIcon, severityRank, filterBySearch, thresholdText, type CheckConfig } from "./report";
import type { IssueOut } from "./api";

function issue(partial: Partial<IssueOut>): IssueOut {
  return {
    id: "x", rule_id: "r", display_name: "Rule", check_description: "Review rule.", category: "accessibility", subcategory: null, impact: "serious",
    description: "d", remediation: "", reference_url: "", wcag_version: null, wcag_level: null,
    criterion_id: null, criterion_name: null, is_best_practice: false, manual_review: false,
    reviewed: false, selector: null, html_snippet: null, bbox: null, viewport: null,
    ...partial,
  };
}

describe("severityIcon", () => {
  it("maps critical/serious to a red error circle", () => {
    for (const impact of ["critical", "serious"]) {
      const s = severityIcon(impact);
      expect(s.kind).toBe("error");
      expect(s.shape).toBe("circle");
      expect(s.color).toBe("#dc2626");
    }
  });
  it("maps moderate to an amber warning triangle", () => {
    const s = severityIcon("moderate");
    expect(s.kind).toBe("warning");
    expect(s.shape).toBe("triangle");
  });
  it("maps minor/info/null to a neutral info marker", () => {
    for (const impact of ["minor", "info", null, undefined]) {
      const s = severityIcon(impact as string | null);
      expect(s.kind).toBe("info");
      expect(s.shape).toBe("info");
    }
  });
  it("ranks severities so errors sort first", () => {
    expect(severityRank("critical")).toBeLessThan(severityRank("serious"));
    expect(severityRank("serious")).toBeLessThan(severityRank("moderate"));
    expect(severityRank("moderate")).toBeLessThan(severityRank("minor"));
    expect(severityRank(null)).toBeGreaterThan(severityRank("minor"));
  });
});

describe("Content check order", () => {
  it("matches the supplied Silktide order exactly", () => {
    expect(CONTENT_CHECK_ORDER).toEqual([
      "broken-links", "spelling", "sensitive_keywords", "link_purpose_unclear",
      "image_optimization", "new_tab_disclosure", "pdf_not_tagged", "thin_pages",
      "grammar", "page-has-heading-one", "pdf_no_title", "title_too_long",
      "reading_level_aaa", "meta_description", "image-redundant-alt", "readability",
      "meta_description_too_short", "empty-heading", "pdf_no_headings", "pdf_no_language",
      "identical-links-same-purpose", "texas_senate_bill_17", "find_accessibility",
      "pdf_heading_order", "eeo_terms", "affirmative_action", "multiple_h1",
      "link_no_text", "pdf_no_bookmarks",
    ]);
    expect(CONTENT_CHECK_ORDER).toHaveLength(29);
    expect(contentCheckRank("broken-links")).toBe(0);
    expect(contentCheckRank("pdf_no_bookmarks")).toBe(28);
    expect(contentCheckRank("not-a-check")).toBe(29);
    expect(contentCheckTitle("sensitive_keywords", "Sensitive keywords", 1)).toBe("Sensitive keywords – 1 time");
    expect(contentCheckTitle("sensitive_keywords", "Sensitive keywords", 4)).toBe("Sensitive keywords – 4 times");
    expect(CONTENT_CHECKS[0].title).toBe("Check and fix broken links");
    expect(CONTENT_CHECKS.at(-1)!.title).toBe("Ensure long PDFs use bookmarks to aid navigation");
  });
});

describe("filterBySearch", () => {
  const issues = [
    issue({ rule_id: "color-contrast", description: "Increase contrast", criterion_name: "Contrast (Minimum)" }),
    issue({ rule_id: "image-alt", description: "Missing alt text", category: "ux", subcategory: "Media" }),
    issue({ rule_id: "hsts", description: "No HSTS header", category: "privacy" }),
  ];
  it("returns all when query is empty", () => {
    expect(filterBySearch(issues, "")).toHaveLength(3);
    expect(filterBySearch(issues, "   ")).toHaveLength(3);
  });
  it("matches on description text", () => {
    expect(filterBySearch(issues, "contrast").map((i) => i.rule_id)).toEqual(["color-contrast"]);
  });
  it("matches on rule id and is case-insensitive", () => {
    expect(filterBySearch(issues, "HSTS")).toHaveLength(1);
  });
  it("matches on subcategory and criterion name", () => {
    expect(filterBySearch(issues, "media")).toHaveLength(1);
    expect(filterBySearch(issues, "minimum")).toHaveLength(1);
  });
  it("returns nothing on no match", () => {
    expect(filterBySearch(issues, "zzz")).toHaveLength(0);
  });
});

describe("thresholdText (sourced from config, never hardcoded in the sentence)", () => {
  const cfg: CheckConfig = {
    thresholds: {
      target_min_px: 24, reflow_viewport_width: 320,
      focus_luminance_delta: 0.1, focus_contrast_min_ratio: 1.3,
      contrast_aa_normal: 4.5, contrast_aa_large: 3.0,
    },
    checks: {}, check_overrides: {},
  };
  it("returns null without config", () => {
    expect(thresholdText("target-size", null)).toBeNull();
  });
  it("pulls the target-size minimum from config", () => {
    const t = thresholdText("target-size", cfg)!;
    expect(t).toContain("24×24");
  });
  it("pulls the reflow width from config", () => {
    expect(thresholdText("reflow", cfg)).toContain("320");
  });
  it("pulls contrast ratios from config", () => {
    const t = thresholdText("color-contrast", cfg)!;
    expect(t).toContain("4.5:1");
    expect(t).toContain("3:1");
  });
  it("reflects a changed config value (proves it is not hardcoded)", () => {
    const changed: CheckConfig = { ...cfg, thresholds: { ...cfg.thresholds, target_min_px: 44 } };
    expect(thresholdText("target-size", changed)).toContain("44×44");
  });
  it("returns null for checks without a numeric threshold", () => {
    expect(thresholdText("spelling", cfg)).toBeNull();
  });
});
