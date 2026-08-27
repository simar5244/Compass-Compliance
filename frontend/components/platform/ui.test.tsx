// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { DeltaChip, ringColor } from "./ui";

afterEach(cleanup);

describe("DeltaChip", () => {
  it("renders a positive delta with a plus sign", () => {
    const { getByText } = render(<DeltaChip delta={4} />);
    expect(getByText("+4")).toBeTruthy();
  });

  it("renders a negative delta with a minus sign", () => {
    const { getByText } = render(<DeltaChip delta={-2} />);
    // uses a real minus glyph (−), not a hyphen
    expect(getByText("−2")).toBeTruthy();
  });

  it("renders zero as ±0", () => {
    const { getByText } = render(<DeltaChip delta={0} />);
    expect(getByText("±0")).toBeTruthy();
  });

  it("renders an em dash for null", () => {
    const { getByText } = render(<DeltaChip delta={null} />);
    expect(getByText("—")).toBeTruthy();
  });

  it("labels direction for assistive tech", () => {
    const { getByLabelText } = render(<DeltaChip delta={5} />);
    expect(getByLabelText("up 5")).toBeTruthy();
  });
});

describe("ringColor", () => {
  it.each([
    [49, "var(--score-red)"],
    [50, "var(--score-amber)"],
    [69, "var(--score-amber)"],
    [70, "var(--score-green)"],
    [84, "var(--score-green)"],
    [85, "var(--score-teal)"],
    [100, "var(--score-teal)"],
  ])("maps %i to the expected score band", (score, color) => {
    expect(ringColor(score)).toBe(color);
  });
});
