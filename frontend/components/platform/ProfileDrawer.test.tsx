// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { ProfileDrawer } from "./ProfileDrawer";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({ changePassword: vi.fn(), logout: vi.fn() }));
vi.mock("@/lib/theme", () => ({ currentTheme: () => "light", setTheme: vi.fn() }));

const user = { id: "1", email: "a@b.c", name: "A", role: "user" as const };

afterEach(cleanup);

describe("ProfileDrawer accessibility", () => {
  it("renders a labelled modal dialog when open", () => {
    const { getByRole } = render(<ProfileDrawer user={user} open onClose={() => {}} />);
    const dialog = getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Profile menu");
  });

  it("renders nothing when closed", () => {
    const { queryByRole } = render(<ProfileDrawer user={user} open={false} onClose={() => {}} />);
    expect(queryByRole("dialog")).toBeNull();
  });

  it("moves focus into the drawer on open", async () => {
    render(<ProfileDrawer user={user} open onClose={() => {}} />);
    await waitFor(() => {
      const active = document.activeElement as HTMLElement;
      expect(active?.closest('[role="dialog"]')).toBeTruthy();
    });
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<ProfileDrawer user={user} open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on outside (backdrop) click", () => {
    const onClose = vi.fn();
    const { getByTestId } = render(<ProfileDrawer user={user} open onClose={onClose} />);
    fireEvent.click(getByTestId("drawer-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("traps focus: Tab past the last element wraps to the first", () => {
    render(<ProfileDrawer user={user} open onClose={() => {}} />);
    const dialog = document.querySelector('[role="dialog"]')!;
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("shows the Admin link only for admins", () => {
    const { queryByText, rerender } = render(<ProfileDrawer user={user} open onClose={() => {}} />);
    expect(queryByText(/Manage users/)).toBeNull();
    rerender(<ProfileDrawer user={{ ...user, role: "admin" }} open onClose={() => {}} />);
    expect(queryByText(/Manage users/)).toBeTruthy();
  });
});
