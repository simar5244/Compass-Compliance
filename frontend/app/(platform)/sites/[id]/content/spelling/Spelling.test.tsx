// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import ContentSpellingPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "abc" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/CompassLoader", () => ({
  CompassLoader: ({ label }: { label?: string }) => <div>{label}</div>,
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getCheckWords: vi.fn(async () => ({
      scan_id: "scan1",
      check_id: "spelling",
      items: [
        {
          word: "teh",
          category: "likely",
          suggestions: ["the"],
          language: "en",
          quantity: 3,
          issue_ids: ["i1"],
          page_urls: ["https://x/p1"],
          page_ids: ["p1"],
          example_issue_id: "i1",
          example_page_id: "p1",
          example_page_url: "https://x/p1",
        },
        {
          word: "Bordeaux",
          category: "different_language",
          suggestions: [],
          language: "fr",
          quantity: 1,
          issue_ids: ["i2"],
          page_urls: ["https://x/p2"],
          page_ids: ["p2"],
          example_issue_id: "i2",
          example_page_id: "p2",
          example_page_url: "https://x/p2",
        },
      ],
    })),
    getCheckHistory: vi.fn(async () => ({
      check_id: "spelling",
      points: [
        { scan_id: "s0", at: "2026-01-01T00:00:00Z", issues: 9, score: 40 },
        { scan_id: "scan1", at: "2026-02-01T00:00:00Z", issues: 4, score: 70 },
      ],
    })),
    getSiteChecksFull: vi.fn(async () => ({
      checks: [{ check_id: "spelling", progress: 70 }],
    })),
    ignoreIssues: vi.fn(async () => ({ ok: true, updated: 1 })),
  };
});

// This project does not run Vitest with globals, so auto-cleanup is not wired up.
afterEach(cleanup);

describe("Content Spelling", () => {
  it("renders the grouped word table under a content header", async () => {
    const { findByText, findByRole } = render(<ContentSpellingPage />);

    expect(await findByText("Check and fix misspellings")).toBeTruthy();
    expect(await findByRole("button", { name: "Pages" })).toBeTruthy();
    expect(await findByText("Likely errors")).toBeTruthy();
  });

  it("groups words by confidence and links each into the inspector", async () => {
    const { findByText, findAllByText, findByRole } = render(<ContentSpellingPage />);

    expect(await findByText("Likely spelling errors")).toBeTruthy();
    expect((await findAllByText("Different language")).length).toBeGreaterThan(0);
    expect(await findByRole("button", { name: "teh" })).toBeTruthy();
    expect(await findByRole("button", { name: "Inspect teh" })).toBeTruthy();
    expect(await findByText("the")).toBeTruthy();
  });
});
