import { describe, expect, it } from "vitest";
import { formatHtml } from "./formatHtml";

describe("formatHtml", () => {
  it("pretty-prints minified markup onto separate indented lines", () => {
    const input = "<!DOCTYPE html><html><head><title>Hi</title></head><body><div><p>x</p></div></body></html>";
    const output = formatHtml(input);

    expect(output).toContain("<!DOCTYPE html>");
    expect(output).toContain("  <head>");
    expect(output).toContain("    <title>Hi</title>");
    expect(output).toContain("      <p>x</p>");
    expect(output.split("\n").length).toBeGreaterThan(6);
  });

  it("leaves already formatted markup unchanged", () => {
    const input = "<html>\n  <body>\n    <p>ok</p>\n  </body>\n</html>";
    expect(formatHtml(input)).toBe(input);
  });
});
