import { describe, expect, it } from "vitest";
import { normalizeWebsiteUrl } from "./api";

describe("normalizeWebsiteUrl", () => {
  it("adds https to a plain domain", () => {
    expect(normalizeWebsiteUrl("example.com")).toBe("https://example.com/");
  });

  it("preserves a full URL and trims whitespace", () => {
    expect(normalizeWebsiteUrl("  http://example.com/path?q=1  ")).toBe(
      "http://example.com/path?q=1",
    );
  });

  it("rejects an empty value", () => {
    expect(() => normalizeWebsiteUrl("   ")).toThrow("Enter a website URL.");
  });
});
