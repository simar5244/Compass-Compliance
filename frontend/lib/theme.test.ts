// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, currentTheme, getStoredTheme, setTheme, toggleTheme } from "./theme";

describe("theme persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    // jsdom has no matchMedia; stub it for systemTheme() fallback.
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

  it("stores and reads the chosen theme", () => {
    setTheme("dark");
    expect(getStoredTheme()).toBe("dark");
    expect(localStorage.getItem("wct-theme")).toBe("dark");
  });

  it("applyTheme toggles the .dark class on <html>", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("setTheme both persists and applies", () => {
    setTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(currentTheme()).toBe("dark");
  });

  it("toggleTheme flips and persists", () => {
    setTheme("light");
    expect(toggleTheme()).toBe("dark");
    expect(getStoredTheme()).toBe("dark");
    expect(toggleTheme()).toBe("light");
    expect(getStoredTheme()).toBe("light");
  });

  it("currentTheme falls back to a value when nothing stored", () => {
    expect(getStoredTheme()).toBeNull();
    expect(["light", "dark"]).toContain(currentTheme());
  });
});
