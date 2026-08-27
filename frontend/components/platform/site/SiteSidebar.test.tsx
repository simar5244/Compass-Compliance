// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { SiteSidebar } from "./SiteSidebar";

const push = vi.fn();
let currentPathname = "/sites/abc/content";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => currentPathname,
  useParams: () => ({ id: "abc" }),
}));

afterEach(() => {
  cleanup();
  push.mockClear();
  currentPathname = "/sites/abc/content";
});

function expand(getByLabelText: (id: string) => HTMLElement) {
  fireEvent.click(getByLabelText("Expand navigation"));
}

describe("SiteSidebar", () => {
  it("highlights the active top-level category based on the current path", () => {
    const { getByLabelText } = render(<SiteSidebar siteId="abc" site={null} />);
    const btn = getByLabelText("Content");
    expect(btn.getAttribute("aria-current")).toBe("page");
    expect(btn.className).toContain("bg-white");
    expect(btn.className).toContain("text-black");
  });

  it("expands and reveals sub-nav when a collapsed category icon is clicked", () => {
    const { getByLabelText, getByText } = render(<SiteSidebar siteId="abc" site={null} />);
    fireEvent.click(getByLabelText("Marketing"));
    expect(getByLabelText("Collapse navigation")).toBeTruthy();
    expect(getByText("Checks")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows sub-nav items when the expanded category row is clicked", () => {
    const { getByText, getByLabelText, queryByText } = render(<SiteSidebar siteId="abc" site={null} />);
    expand(getByLabelText);
    expect(queryByText("Spelling")).toBeNull();
    fireEvent.click(getByLabelText("Content sub-pages"));
    expect(getByText("Checks")).toBeTruthy();
    expect(getByText("Spelling")).toBeTruthy();
  });

  it("toggles sub-nav from the category row when the sidebar is already expanded", () => {
    const { getByLabelText, getByText } = render(<SiteSidebar siteId="abc" site={null} />);
    expand(getByLabelText);
    fireEvent.click(getByLabelText("Content sub-pages"));
    expect(getByText("Spelling")).toBeTruthy();
  });

  it("renders the selected sub-nav tab as a highlighted control when expanded", () => {
    const { getByText, getByLabelText } = render(<SiteSidebar siteId="abc" site={null} />);
    expand(getByLabelText);
    fireEvent.click(getByLabelText("Content sub-pages"));
    const activeSubNav = getByText("Overview").closest("button")!;
    expect(activeSubNav.getAttribute("aria-current")).toBe("page");
    expect(activeSubNav.className).toContain("bg-white");
    expect(activeSubNav.className).toContain("text-black");
  });

  it("navigates to the website list from the Texas Tech mark", () => {
    const { getByLabelText } = render(<SiteSidebar siteId="abc" site={null} />);
    fireEvent.click(getByLabelText("Texas Tech — go to websites"));
    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("navigates to overview from the Overview item", () => {
    const { getByLabelText } = render(<SiteSidebar siteId="abc" site={null} />);
    fireEvent.click(getByLabelText("Overview"));
    expect(push).toHaveBeenCalledWith("/sites/abc");
  });

  it("collapses expanded navigation when a sub-page link is selected", () => {
    const { getByText, getByLabelText } = render(<SiteSidebar siteId="abc" site={null} />);
    expand(getByLabelText);
    fireEvent.click(getByLabelText("Content sub-pages"));
    fireEvent.click(getByText("Pages"));
    expect(push).toHaveBeenCalledWith("/sites/abc/content/pages");
    expect(getByLabelText("Expand navigation")).toBeTruthy();
  });

  it("stays expanded when opening a sub-page menu without navigating", () => {
    const { getByLabelText } = render(<SiteSidebar siteId="abc" site={null} />);
    expand(getByLabelText);
    fireEvent.click(getByLabelText("Content sub-pages"));
    expect(getByLabelText("Collapse navigation")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("reserves horizontal space for the expanded sidebar", () => {
    const { getByLabelText, container } = render(<SiteSidebar siteId="abc" site={null} />);
    expand(getByLabelText);
    const aside = container.querySelector("aside") as HTMLElement;
    expect(aside.style.width).toBe("240px");
  });

  it("places the TTU categories between policies and inventory", () => {
    currentPathname = "/sites/abc";
    const { getByLabelText, container } = render(<SiteSidebar siteId="abc" site={null} />);
    expand(getByLabelText);
    const labels = Array.from(
      container.querySelectorAll("[data-site-nav] button[aria-label$='sub-pages'], [data-site-nav] button[aria-label]:not([aria-label$='overview']):not([aria-label$='sub-pages'])"),
      (button) => button.textContent?.replace(/\s+/g, " ").trim(),
    ).filter((label) => label && !label.includes("overview"));
    expect(labels.indexOf("Policies")).toBeLessThan(labels.indexOf("TTU Compliance"));
    expect(labels.indexOf("TTU Compliance")).toBeLessThan(labels.indexOf("Brand Standards"));
    expect(labels.indexOf("Brand Standards")).toBeLessThan(labels.indexOf("Inventory"));
  });
});
