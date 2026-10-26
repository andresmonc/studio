import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({ login: vi.fn(), isPending: false }));
vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useLogin: () => ({ mutate: h.login, isPending: h.isPending }),
}));

import { LoginPage } from "./login";

describe("LoginPage", () => {
  beforeEach(() => {
    h.login.mockReset();
    h.isPending = false;
  });

  it("sign in starts the login flow", async () => {
    render(<LoginPage />);
    expect(screen.getByText("login.title")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "login.signIn" }));
    expect(h.login).toHaveBeenCalledWith({});
  });

  it("disables sign in while the login is pending", () => {
    h.isPending = true;
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: "login.signIn" })).toBeDisabled();
  });
});
