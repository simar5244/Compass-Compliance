// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor, cleanup, screen } from "@testing-library/react";
import type { IssueOut } from "@/lib/api";

const { streamIssueAI } = vi.hoisted(() => ({ streamIssueAI: vi.fn() }));
vi.mock("@/lib/ai", () => ({
  streamIssueAI,
  AI_LEVELS: [
    { value: "non_technical", label: "Non-technical" },
    { value: "moderately_technical", label: "Moderately technical" },
    { value: "highly_technical", label: "Highly technical" },
  ],
}));
import { IssueAIPanel } from "./IssueAIPanel";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const issue: IssueOut = {
  id: "issue-1", rule_id: "image-alt", display_name: "Images must have alternative text",
  check_description: "Add useful alternative text.", category: "accessibility", subcategory: "Images",
  impact: "serious", description: "Image is missing alternative text", remediation: "Add alt text",
  reference_url: "", wcag_version: "2.2", wcag_level: "A", criterion_id: "1.1.1",
  criterion_name: "Non-text Content", is_best_practice: false, manual_review: false, reviewed: false,
  selector: "img", html_snippet: "<img src='hero.jpg'>", bbox: null, viewport: null,
};

describe("IssueAIPanel", () => {
  beforeEach(() => {
    streamIssueAI.mockImplementation(async (_issue: IssueOut, _messages: unknown[], onToken: (token: string) => void) => {
      onToken("Use an alt attribute.");
    });
  });

  it("auto-sends the first question at the default level and renders streamed text", async () => {
    render(<IssueAIPanel issue={issue} onClose={() => undefined} />);
    await waitFor(() => expect(streamIssueAI).toHaveBeenCalled());
    expect(streamIssueAI.mock.calls[0][1]).toEqual([{ role: "user", content: "What is this issue and how do I fix it?" }]);
    expect(streamIssueAI.mock.calls[0][3]).toEqual({ reportSlug: undefined, level: "moderately_technical" });
    expect(document.body.textContent).toContain("Use an alt attribute.");
  });

  it("sends follow-up messages with conversation history", async () => {
    render(<IssueAIPanel issue={issue} onClose={() => undefined} />);
    await waitFor(() => expect(streamIssueAI).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByPlaceholderText("Ask a follow-up…"), { target: { value: "Show me the code" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(streamIssueAI).toHaveBeenCalledTimes(2));
    expect(streamIssueAI.mock.calls[1][1]).toEqual([
      { role: "user", content: "What is this issue and how do I fix it?" },
      { role: "assistant", content: "Use an alt attribute." },
      { role: "user", content: "Show me the code" },
    ]);
  });

  it("re-asks at the chosen explanation level", async () => {
    render(<IssueAIPanel issue={issue} onClose={() => undefined} />);
    await waitFor(() => expect(streamIssueAI).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Explanation level"), { target: { value: "highly_technical" } });
    await waitFor(() => expect(streamIssueAI).toHaveBeenCalledTimes(2));

    // The conversation restarts so the whole answer is at the new level.
    expect(streamIssueAI.mock.calls[1][1]).toEqual([
      { role: "user", content: "What is this issue and how do I fix it?" },
    ]);
    expect(streamIssueAI.mock.calls[1][3]).toEqual({ reportSlug: undefined, level: "highly_technical" });
  });

  it("uses the Sensitive Keywords opening prompt and the public report route", async () => {
    const sensitive: IssueOut = {
      ...issue,
      id: "keyword-1",
      rule_id: "sensitive_keywords",
      display_name: "Sensitive keywords",
      check_description: "Review sensitive keywords.",
      category: "content",
      manual_review: true,
      html_snippet: JSON.stringify({ matched_text: "review term", context: "context containing the review term" }),
    };
    render(<IssueAIPanel issue={sensitive} reportSlug="report-slug" onClose={() => undefined} />);
    await waitFor(() => expect(streamIssueAI).toHaveBeenCalled());
    expect(streamIssueAI.mock.calls[0][1][0].content).toContain("Sensitive Keywords occurrence");
    expect(streamIssueAI.mock.calls[0][3]).toEqual({ reportSlug: "report-slug", level: "moderately_technical" });
  });
});
