// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IssueOut } from "@/lib/api";
import { GroupedInstanceList } from "./GroupedInstanceList";

afterEach(() => cleanup());

function keyword(id: string, word: string, y: number): IssueOut {
  return {
    id, rule_id: "sensitive_keywords", display_name: "Sensitive keywords",
    check_description: "Review the keyword in context.", category: "content", subcategory: "Keywords",
    impact: "minor", description: `Sensitive keyword: ${word}`, remediation: "Review it.",
    reference_url: "", wcag_version: null, wcag_level: null, criterion_id: null, criterion_name: null,
    is_best_practice: false, manual_review: true, reviewed: false, selector: `#word-${id}`,
    html_snippet: JSON.stringify({ matched_text: word, context: `Context for ${word}` }),
    bbox: { x: 10, y, width: 50, height: 14 }, viewport: "desktop",
  };
}

describe("Sensitive Keywords grouped instances", () => {
  it("keeps occurrence order and shows Ask AI only for the selected word", () => {
    const issues = [keyword("1", "first term", 20), keyword("2", "second term", 60), keyword("3", "third term", 100), keyword("4", "fourth term", 140)];
    render(<GroupedInstanceList issues={issues} selectedId="1" onSelect={vi.fn()} onIgnore={vi.fn()} onAskAI={vi.fn()} />);
    expect(screen.getAllByRole("article").map((item) => item.querySelector(".font-semibold")?.textContent)).toEqual([
      "first term", "second term", "third term", "fourth term",
    ]);
    expect(screen.getAllByRole("button", { name: /Ask AI about/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Ask AI about first term" })).toBeTruthy();
  });
});
