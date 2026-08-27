// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ScoreRing } from "@/components/platform/ui";

describe("Platform ScoreRing", () => {
  it("shows a percent sign", () => {
    const { getByText } = render(<ScoreRing score={87} />);
    expect(getByText("87%")).toBeTruthy();
  });

  it("uses teal for 85+", () => {
    const { getByText } = render(<ScoreRing score={90} />);
    const el = getByText("90%");
    expect(el.getAttribute("style") || "").toContain("var(--score-teal)");
  });

  it("uses green for 70-84", () => {
    const { getByText } = render(<ScoreRing score={70} />);
    const el = getByText("70%");
    expect(el.getAttribute("style") || "").toContain("var(--score-green)");
  });

  it("uses amber for 50-69", () => {
    const { getByText } = render(<ScoreRing score={50} />);
    const el = getByText("50%");
    expect(el.getAttribute("style") || "").toContain("var(--score-amber)");
  });

  it("uses red for 0-49", () => {
    const { getByText } = render(<ScoreRing score={49} />);
    const el = getByText("49%");
    expect(el.getAttribute("style") || "").toContain("var(--score-red)");
  });
});
