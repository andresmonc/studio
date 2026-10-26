import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm as useRHForm } from "react-hook-form";

const h = vi.hoisted(() => ({
  mono: false,
  isLoading: false,
  members: [] as unknown[],
  outcome: "success" as "success" | "error",
  mutate: vi.fn(),
  refetch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useCustom: () => ({
    query: { data: { data: h.members }, isLoading: h.isLoading, refetch: h.refetch },
  }),
  useCustomMutation: () => ({ mutate: h.mutate }),
}));
vi.mock("@refinedev/react-hook-form", () => ({ useForm: useRHForm }));
vi.mock("@/providers/ui-config", () => ({ isMonoCompany: () => h.mono }));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => h.toastSuccess(...a),
    error: (...a: unknown[]) => h.toastError(...a),
  },
}));

import { CompanyMembersCard } from "./members";

const jane = { id: "u1", companyId: "c1", userId: "u1", email: "jane@acme.com", name: "Jane", role: "member" };
const membersUrl = /\/companies\/c1\/members$/;

beforeEach(() => {
  h.mono = false;
  h.isLoading = false;
  h.members = [jane];
  h.outcome = "success";
  h.mutate.mockReset();
  h.mutate.mockImplementation((_opts, cbs) =>
    h.outcome === "success" ? cbs.onSuccess() : cbs.onError(new Error("boom")),
  );
  h.refetch.mockReset();
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

const lastCall = () => h.mutate.mock.calls.at(-1)![0];

describe("CompanyMembersCard remove button", () => {
  const tests = [
    { name: "multi company: members can be removed", mono: false, wantRemove: true },
    { name: "mono company: the server refuses removals, so no button", mono: true, wantRemove: false },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      h.mono = tt.mono;
      render(<CompanyMembersCard companyId="c1" />);
      expect(screen.getByText("jane@acme.com")).toBeInTheDocument();
      const remove = screen.queryByRole("button", { name: "company.members.removeAria" });
      expect(remove !== null).toBe(tt.wantRemove);
    });
  }
});

describe("CompanyMembersCard list states", () => {
  const tests = [
    { name: "loading", isLoading: true, members: [], want: "common.loading" },
    { name: "empty", isLoading: false, members: [], want: "company.members.empty" },
    { name: "non-array payload is treated as empty", isLoading: false, members: null, want: "company.members.empty" },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      h.isLoading = tt.isLoading;
      h.members = tt.members as unknown[];
      render(<CompanyMembersCard companyId="c1" />);
      expect(screen.getByText(tt.want)).toBeInTheDocument();
    });
  }
});

describe("CompanyMembersCard add member", () => {
  it("rejects an invalid email without calling the API", async () => {
    const user = userEvent.setup();
    render(<CompanyMembersCard companyId="c1" />);
    await user.type(screen.getByPlaceholderText("company.members.emailPlaceholder"), "nope");
    await user.click(screen.getByRole("button", { name: "company.members.add" }));
    expect(await screen.findByText("company.members.validEmail")).toBeInTheDocument();
    expect(h.mutate).not.toHaveBeenCalled();
  });

  const tests = [
    { name: "success toasts, resets and refetches", outcome: "success" as const, wantToast: "company.members.added" },
    { name: "error toasts the failure", outcome: "error" as const, wantToast: "company.members.addError" },
  ];
  for (const tt of tests) {
    it(tt.name, async () => {
      h.outcome = tt.outcome;
      const user = userEvent.setup();
      render(<CompanyMembersCard companyId="c1" />);
      const email = screen.getByPlaceholderText("company.members.emailPlaceholder");
      await user.type(email, "bob@acme.com");
      // The add form's role select is the first combobox.
      await user.click(screen.getAllByRole("combobox")[0]);
      await user.click(screen.getByRole("option", { name: "company.roles.admin" }));
      await user.click(screen.getByRole("button", { name: "company.members.add" }));

      expect(lastCall()).toMatchObject({
        url: expect.stringMatching(membersUrl),
        method: "post",
        values: { email: "bob@acme.com", role: "admin" },
      });
      if (tt.outcome === "success") {
        expect(h.toastSuccess).toHaveBeenCalledWith(tt.wantToast);
        expect(h.refetch).toHaveBeenCalled();
        expect(email).toHaveValue("");
      } else {
        expect(h.toastError).toHaveBeenCalledWith(tt.wantToast, { description: "boom" });
        expect(email).toHaveValue("bob@acme.com");
      }
    });
  }
});

describe("CompanyMembersCard change role", () => {
  const tests = [
    { name: "success", outcome: "success" as const, wantSuccess: "company.members.roleUpdated" },
    { name: "error", outcome: "error" as const, wantError: "company.members.roleError" },
  ];
  for (const tt of tests) {
    it(tt.name, async () => {
      h.outcome = tt.outcome;
      const user = userEvent.setup();
      render(<CompanyMembersCard companyId="c1" />);
      await user.click(screen.getAllByRole("combobox")[1]);
      await user.click(screen.getByRole("option", { name: "company.roles.admin" }));

      expect(lastCall()).toMatchObject({
        url: expect.stringMatching(/\/companies\/c1\/members\/u1$/),
        method: "patch",
        values: { role: "admin" },
      });
      if (tt.wantSuccess) {
        expect(h.toastSuccess).toHaveBeenCalledWith(tt.wantSuccess);
        expect(h.refetch).toHaveBeenCalled();
      } else {
        expect(h.toastError).toHaveBeenCalledWith(tt.wantError, { description: "boom" });
      }
    });
  }
});

describe("CompanyMembersCard remove member", () => {
  const tests = [
    { name: "success closes the dialog and refetches", outcome: "success" as const },
    { name: "error toasts the failure", outcome: "error" as const },
  ];
  for (const tt of tests) {
    it(tt.name, async () => {
      h.outcome = tt.outcome;
      const user = userEvent.setup();
      render(<CompanyMembersCard companyId="c1" />);
      await user.click(screen.getByRole("button", { name: "company.members.removeAria" }));
      expect(screen.getByText("company.members.removeTitle")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "common.remove" }));

      expect(lastCall()).toMatchObject({
        url: expect.stringMatching(/\/companies\/c1\/members\/u1$/),
        method: "delete",
      });
      if (tt.outcome === "success") {
        expect(h.toastSuccess).toHaveBeenCalledWith("company.members.removed");
        expect(h.refetch).toHaveBeenCalled();
        expect(screen.queryByText("company.members.removeTitle")).toBeNull();
      } else {
        expect(h.toastError).toHaveBeenCalledWith("company.members.removeError", { description: "boom" });
        expect(h.refetch).not.toHaveBeenCalled();
      }
    });
  }

  it("cancel closes the dialog without calling the API", async () => {
    const user = userEvent.setup();
    render(<CompanyMembersCard companyId="c1" />);
    await user.click(screen.getByRole("button", { name: "company.members.removeAria" }));
    await user.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(screen.queryByText("company.members.removeTitle")).toBeNull();
    expect(h.mutate).not.toHaveBeenCalled();
  });
});
