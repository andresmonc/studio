import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm as useRHForm } from "react-hook-form";
import { HttpError } from "@/providers/http";

const h = vi.hoisted(() => ({
  onFinish: vi.fn(),
  formLoading: false,
  refreshIdentity: vi.fn(),
  refineCoreProps: undefined as unknown as {
    id: string;
    successNotification: () => { message: string };
    errorNotification: (e?: unknown) => { message: string };
  },
}));

vi.mock("@refinedev/core", () => ({ useTranslate: () => (key: string) => key }));
// Plain react-hook-form plus a stubbed refineCore, capturing the props the
// component hands to refine so the notification builders can be asserted.
vi.mock("@refinedev/react-hook-form", () => ({
  useForm: ({ refineCoreProps, ...opts }: { refineCoreProps: typeof h.refineCoreProps }) => {
    h.refineCoreProps = refineCoreProps;
    return {
      ...useRHForm(opts),
      refineCore: { onFinish: h.onFinish, formLoading: h.formLoading },
    };
  },
}));
vi.mock("@/providers/auth", () => ({ refreshIdentity: () => h.refreshIdentity() }));

import { CompanyDetailsCard } from "./details";

beforeEach(() => {
  h.onFinish.mockReset();
  h.onFinish.mockResolvedValue({});
  h.formLoading = false;
  h.refreshIdentity.mockReset();
});

const nameInput = () => screen.getByRole("textbox", { name: "common.displayName" });
const descInput = () => screen.getByRole("textbox", { name: "common.description" });

describe("CompanyDetailsCard", () => {
  it("edits the given company via refine", () => {
    render(<CompanyDetailsCard companyId="c1" />);
    expect(h.refineCoreProps).toMatchObject({ resource: "companies", action: "edit", id: "c1", redirect: false });
    expect(h.refineCoreProps.successNotification().message).toBe("companies.edit.success");
  });

  const notifications = [
    { name: "error notification prefers the server message", err: new HttpError("name taken", 409), want: "name taken" },
    { name: "error notification falls back to a generic message", err: undefined, want: "companies.edit.error" },
  ];
  for (const tt of notifications) {
    it(tt.name, () => {
      render(<CompanyDetailsCard companyId="c1" />);
      expect(h.refineCoreProps.errorNotification(tt.err).message).toBe(tt.want);
    });
  }

  it("saves the form and refreshes the identity", async () => {
    const user = userEvent.setup();
    render(<CompanyDetailsCard companyId="c1" />);
    await user.type(nameInput(), "Acme");
    await user.type(descInput(), "We make things");
    await user.click(screen.getByRole("button", { name: "common.save" }));
    await waitFor(() => expect(h.refreshIdentity).toHaveBeenCalled());
    expect(h.onFinish).toHaveBeenCalledWith({ displayName: "Acme", description: "We make things" });
  });

  const validation = [
    { name: "display name is required", display: "", desc: "", want: "companies.edit.displayNameRequired" },
    { name: "description is capped at 500 chars", display: "Acme", desc: "x".repeat(501), want: "common.maxChars" },
  ];
  for (const tt of validation) {
    it(tt.name, async () => {
      const user = userEvent.setup();
      render(<CompanyDetailsCard companyId="c1" />);
      if (tt.display) await user.type(nameInput(), tt.display);
      if (tt.desc) {
        await user.click(descInput());
        await user.paste(tt.desc);
      }
      await user.click(screen.getByRole("button", { name: "common.save" }));
      expect(await screen.findByText(tt.want)).toBeInTheDocument();
      expect(h.onFinish).not.toHaveBeenCalled();
    });
  }

  // refine's errorNotification toasts the message; only field errors land on the form.
  const failures = [
    {
      name: "maps server field errors onto the form",
      err: new HttpError("validation failed", 400, { displayName: ["already used", "too similar"] }),
      wantField: "already used, too similar",
    },
    { name: "an HttpError without field errors leaves the fields valid", err: new HttpError("down", 503) },
    { name: "a network error leaves the fields valid", err: new TypeError("Failed to fetch") },
  ];
  for (const tt of failures) {
    it(tt.name, async () => {
      h.onFinish.mockRejectedValue(tt.err);
      const user = userEvent.setup();
      render(<CompanyDetailsCard companyId="c1" />);
      await user.type(nameInput(), "Acme");
      await user.click(screen.getByRole("button", { name: "common.save" }));
      await waitFor(() => expect(h.onFinish).toHaveBeenCalled());
      if (tt.wantField) expect(await screen.findByText(tt.wantField)).toBeInTheDocument();
      else expect(nameInput()).toHaveAttribute("aria-invalid", "false");
      expect(h.refreshIdentity).not.toHaveBeenCalled();
    });
  }

  it("disables the button while saving", () => {
    h.formLoading = true;
    render(<CompanyDetailsCard companyId="c1" />);
    expect(screen.getByRole("button", { name: "common.saving" })).toBeDisabled();
  });
});
