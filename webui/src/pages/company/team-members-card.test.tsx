import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm as useRHForm } from "react-hook-form";

const h = vi.hoisted(() => ({
  isLoading: false,
  members: [] as unknown,
  addable: [] as unknown,
  outcome: "success" as "success" | "error",
  mutate: vi.fn(),
  refetch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

// Routes useCustom by URL: team members vs. the addable-members picker list.
vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useCustom: ({ url }: { url: string }) => ({
    query: url.endsWith("/members")
      ? { data: { data: h.members }, isLoading: h.isLoading, refetch: h.refetch }
      : { data: { data: h.addable }, isLoading: false, refetch: vi.fn() },
  }),
  useCustomMutation: () => ({ mutate: h.mutate }),
}));
vi.mock("@refinedev/react-hook-form", () => ({ useForm: useRHForm }));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => h.toastSuccess(...a),
    error: (...a: unknown[]) => h.toastError(...a),
  },
}));

import { TeamMembersCard } from "./team-members-card";

const jane = { id: "u1", teamId: "t1", userId: "u1", email: "jane@acme.com", name: "Jane", role: "viewer", createdAt: "" };
const companyUser = (id: string, email: string, name: string) => ({ id, companyId: "c1", userId: id, email, name, role: "member" });

beforeEach(() => {
  h.isLoading = false;
  h.members = [jane];
  // Jane is already in the team, so only Bob should be offered.
  h.addable = [companyUser("u1", "jane@acme.com", "Jane"), companyUser("u2", "bob@acme.com", "Bob")];
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
const addButton = () => screen.queryByRole("button", { name: "team.detail.addMember" });

describe("TeamMembersCard access", () => {
  const tests = [
    { name: "maintainer: add form, role selects and remove buttons", editable: true },
    { name: "viewer: read-only roles, no add form, no remove column", editable: false },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      render(<TeamMembersCard teamId="t1" editable={tt.editable} />);
      expect(screen.getByText("jane@acme.com")).toBeInTheDocument();
      expect(addButton() !== null).toBe(tt.editable);
      expect(screen.queryByRole("button", { name: "team.detail.removeAria" }) !== null).toBe(tt.editable);
      expect(screen.queryByText("company.members.removeHead") !== null).toBe(tt.editable);
      // Read-only mode renders the role as plain text instead of a select.
      expect(screen.queryByText("viewer", { selector: "span.capitalize" }) !== null).toBe(!tt.editable);
    });
  }
});

describe("TeamMembersCard list states", () => {
  const tests = [
    { name: "loading", isLoading: true, members: [], editable: true, want: "common.loading" },
    { name: "empty", isLoading: false, members: [], editable: false, want: "team.detail.noMembers" },
    { name: "non-array payload is treated as empty", isLoading: false, members: null, editable: true, want: "team.detail.noMembers" },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      h.isLoading = tt.isLoading;
      h.members = tt.members;
      render(<TeamMembersCard teamId="t1" editable={tt.editable} />);
      expect(screen.getByText(tt.want)).toBeInTheDocument();
    });
  }
});

describe("TeamMembersCard add member", () => {
  it("requires a user to be picked", async () => {
    const user = userEvent.setup();
    render(<TeamMembersCard teamId="t1" editable />);
    await user.click(addButton()!);
    expect(await screen.findByText("team.detail.validEmail")).toBeInTheDocument();
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("only offers company members not already in the team", async () => {
    const user = userEvent.setup();
    render(<TeamMembersCard teamId="t1" editable />);
    await user.click(screen.getAllByRole("combobox")[0]);
    expect(await screen.findByRole("option", { name: /bob@acme\.com/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /jane@acme\.com/ })).toBeNull();
  });

  const tests = [
    { name: "success toasts and refetches", outcome: "success" as const },
    { name: "error toasts the failure", outcome: "error" as const },
  ];
  for (const tt of tests) {
    it(tt.name, async () => {
      h.outcome = tt.outcome;
      const user = userEvent.setup();
      render(<TeamMembersCard teamId="t1" editable />);
      const picker = screen.getAllByRole("combobox")[0];
      await user.click(picker);
      await user.click(await screen.findByRole("option", { name: /bob@acme\.com/ }));
      // Second combobox is the add form's role select.
      await user.click(screen.getAllByRole("combobox")[1]);
      await user.click(screen.getByRole("option", { name: "editor" }));
      await user.click(addButton()!);

      expect(lastCall()).toMatchObject({
        url: expect.stringMatching(/\/teams\/t1\/members$/),
        method: "post",
        values: { email: "bob@acme.com", role: "editor" },
      });
      if (tt.outcome === "success") {
        expect(h.toastSuccess).toHaveBeenCalledWith("team.detail.added");
        expect(h.refetch).toHaveBeenCalled();
        expect(picker).toHaveTextContent("team.detail.selectUser");
      } else {
        expect(h.toastError).toHaveBeenCalledWith("team.detail.addError", { description: "boom" });
        expect(picker).toHaveTextContent("Bob (bob@acme.com)");
      }
    });
  }
});

describe("TeamMembersCard change role", () => {
  const tests = [
    { name: "success", outcome: "success" as const },
    { name: "error", outcome: "error" as const },
  ];
  for (const tt of tests) {
    it(tt.name, async () => {
      h.outcome = tt.outcome;
      const user = userEvent.setup();
      render(<TeamMembersCard teamId="t1" editable />);
      // Comboboxes: member picker, add-form role, then Jane's row role.
      await user.click(screen.getAllByRole("combobox")[2]);
      await user.click(screen.getByRole("option", { name: "admin" }));

      expect(lastCall()).toMatchObject({
        url: expect.stringMatching(/\/teams\/t1\/members\/u1$/),
        method: "patch",
        values: { role: "admin" },
      });
      if (tt.outcome === "success") {
        expect(h.toastSuccess).toHaveBeenCalledWith("team.detail.roleUpdated");
        expect(h.refetch).toHaveBeenCalled();
      } else {
        expect(h.toastError).toHaveBeenCalledWith("team.detail.roleError", { description: "boom" });
      }
    });
  }
});

describe("TeamMembersCard remove member", () => {
  const tests = [
    { name: "success toasts and refetches", outcome: "success" as const },
    { name: "error toasts the failure", outcome: "error" as const },
  ];
  for (const tt of tests) {
    it(tt.name, async () => {
      h.outcome = tt.outcome;
      const user = userEvent.setup();
      render(<TeamMembersCard teamId="t1" editable />);
      await user.click(screen.getByRole("button", { name: "team.detail.removeAria" }));
      expect(screen.getByText("team.detail.removeTitle")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "common.remove" }));

      expect(lastCall()).toMatchObject({
        url: expect.stringMatching(/\/teams\/t1\/members\/u1$/),
        method: "delete",
      });
      if (tt.outcome === "success") {
        expect(h.toastSuccess).toHaveBeenCalledWith("team.detail.removed");
        expect(h.refetch).toHaveBeenCalled();
      } else {
        expect(h.toastError).toHaveBeenCalledWith("team.detail.removeError", { description: "boom" });
        expect(h.refetch).not.toHaveBeenCalled();
      }
    });
  }

  it("cancel closes the dialog without calling the API", async () => {
    const user = userEvent.setup();
    render(<TeamMembersCard teamId="t1" editable />);
    await user.click(screen.getByRole("button", { name: "team.detail.removeAria" }));
    await user.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(screen.queryByText("team.detail.removeTitle")).toBeNull();
    expect(h.mutate).not.toHaveBeenCalled();
  });
});
