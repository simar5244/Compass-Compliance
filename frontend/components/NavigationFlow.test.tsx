// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LoginForm } from "@/components/LoginForm";
import { AppSidebarTools } from "@/components/platform/AppSidebarTools";
import { login } from "@/lib/auth";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, login: vi.fn(async () => ({ id: "u1", email: "admin", name: "Admin", role: "admin" })) };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("application navigation flow", () => {
  it("opens the authenticated Inspect entry from the sidebar navigation", async () => {
    render(<AppSidebarTools expanded={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Inspect a page (instant scan)" }));
    expect(navigation.push).toHaveBeenCalledWith("/inspect");
  });

  it("replaces Login with Dashboard after successful authentication", async () => {
    render(<LoginForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email address"), "admin");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(login).toHaveBeenCalledWith("admin", "password"));
    expect(navigation.replace).toHaveBeenCalledWith("/dashboard");
    expect(navigation.refresh).toHaveBeenCalled();
  });
});
