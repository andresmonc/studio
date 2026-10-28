import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { useForm as useRHForm } from "react-hook-form";

const h = vi.hoisted(() => ({
  isLoading: false,
  teams: [] as unknown,
  members: [] as unknown,
  outcome: "success" as "success" | "error",
  mutate: vi.fn(),
  refetch: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  activeTeamId: "t1" as string | null,
  setActiveTeamId: vi.fn(),
  refreshIdentity: vi.fn(),
}));

// Routes useCustom by URL: the teams list vs. the company members (admin picker).
vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useCustom: ({ url }: { url: string }) => ({
    query: url.endsWith("/teams")
      ? { data: { data: h.teams }, isLoading: h.isLoading, refetch: h.refetch }
      : { data: { data: h.members }, isLoading: false, refetch: vi.fn() },
  }),
  useCustomMutation: () => ({ mutate: h.mutate }),
}));
vi.mock("@refinedev/react-hook-form", () => ({ useForm: useRHForm }));
vi.mock("react-router", async (orig) => ({
  ...(await orig<typeof import("react-router")>()),
  useNavigate: () => h.navigate,
}));
vi.mock("@/hooks/use-active-team", () => ({
  useActiveTeam: () => ({ activeTeamId: h.activeTeamId, setActiveTeamId: h.setActiveTeamId }),
}));
vi.mock("@/providers/auth", () => ({ refreshIdentity: () => h.refreshIdentity() }));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => h.toastSuccess(...a),
    error: (...a: unknown[]) => h.toastError(...a),
  },
}));

import { CompanyTeamsCard } from "./teams";

const team = {
  id: "t1",
  companyId: "c1",
  name: "Platform",
  description: "Core infra",
  createdAt: "2026-01-02T03:04:05Z",
  updatedAt: "",
};
const jane = { id: "u1", companyId: "c1", userId: "u1", email: "jane@acme.com", name: "Jane", role: "admin" };

beforeEach(() => {
  h.isLoading = false;
  h.teams = [team];
  h.members = [jane];
  h.outcome = "success";
  h.mutate.mockReset();
  h.mutate.mockImplementation((_opts, cbs) =>
    h.outcome === "success" ? cbs.onSuccess() : cbs.onError(new Error("boom")),
  );
  h.refetch.mockReset();
  h.navigate.mockReset();
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
  h.activeTeamId = "t1";
  h.setActiveTeamId.mockReset();
  h.refreshIdentity.mockReset();
  h.refreshIdentity.mockResolvedValue(undefined);
});

const renderCard = () =>
  render(
    <MemoryRouter>
      <CompanyTeamsCard companyId="c1" />
    </MemoryRouter>,
  );
const lastCall = () => h.mutate.mock.calls.at(-1)![0];

describe("CompanyTeamsCard list", () => {
  const tests = [
    { name: "loading", isLoading: true, teams: [], want: "common.loading" },
    { name: "empty", isLoading: false, teams: [], want: "company.teams.empty" },
    { name: "non-array payload is treated as empty", isLoading: false, teams: null, want: "company.teams.empty" },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      h.isLoading = tt.isLoading;
      h.teams = tt.teams;
      renderCard();
      expect(screen.getByText(tt.want)).toBeInTheDocument();
    });
  }

  it("lists teams with their description and creation date", () => {
    h.teams = [team, { ...team, id: "t2", name: "Growth", createdAt: "" }];
    renderCard();
    expect(screen.getByText("Platform")).toBeInTheDocument();
    expect(screen.getByText("Growth")).toBeInTheDocument();
    expect(screen.getAllByText("Core infra")).toHaveLength(2);
    expect(screen.getByText(new Date(team.createdAt).toLocaleString())).toBeInTheDocument();
  });

  it("edit navigates to the team detail page", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "company.teams.editAria" }));
    expect(h.navigate).toHaveBeenCalledWith("/company/teams/t1");
  });
});

describe("CompanyTeamsCard delete", () => {
  const tests = [
    { name: "success toasts and refetches", outcome: "success" as const },
    { name: "error toasts the failure", outcome: "error" as const },
  ];
  for (const tt of tests) {
    it(tt.name, async () => {
      h.outcome = tt.outcome;
      const user = userEvent.setup();
      renderCard();
      await user.click(screen.getByRole("button", { name: "company.teams.deleteAria" }));
      expect(screen.getByText("company.teams.deleteTitle")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "common.delete" }));

      expect(lastCall()).toMatchObject({
        url: expect.stringMatching(/\/teams\/t1$/),
        method: "delete",
      });
      if (tt.outcome === "success") {
        expect(h.toastSuccess).toHaveBeenCalledWith("company.teams.deleted");
        expect(h.refetch).toHaveBeenCalled();
      } else {
        expect(h.toastError).toHaveBeenCalledWith("company.teams.deleteError", { description: "boom" });
        expect(h.refetch).not.toHaveBeenCalled();
      }
    });
  }

  const activeTests = [
    { name: "deleting the active team refreshes memberships, then clears it", activeTeamId: "t1", wantCleared: true },
    { name: "deleting another team keeps the active one", activeTeamId: "t2", wantCleared: false },
  ];
  for (const tt of activeTests) {
    it(tt.name, async () => {
      h.activeTeamId = tt.activeTeamId;
      const order: string[] = [];
      h.refreshIdentity.mockImplementation(async () => {
        order.push("refresh");
      });
      h.setActiveTeamId.mockImplementation(() => order.push("clear"));
      const user = userEvent.setup();
      renderCard();
      await user.click(screen.getByRole("button", { name: "company.teams.deleteAria" }));
      await user.click(screen.getByRole("button", { name: "common.delete" }));

      await waitFor(() => expect(h.refreshIdentity).toHaveBeenCalledTimes(1));
      if (tt.wantCleared) {
        await waitFor(() => expect(h.setActiveTeamId).toHaveBeenCalledWith(null));
        expect(order).toEqual(["refresh", "clear"]);
      } else {
        expect(h.setActiveTeamId).not.toHaveBeenCalled();
      }
    });
  }

  it("a failed delete keeps the active team and memberships", async () => {
    h.outcome = "error";
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "company.teams.deleteAria" }));
    await user.click(screen.getByRole("button", { name: "common.delete" }));
    expect(h.refreshIdentity).not.toHaveBeenCalled();
    expect(h.setActiveTeamId).not.toHaveBeenCalled();
  });

  it("cancel closes the dialog without calling the API", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "company.teams.deleteAria" }));
    await user.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(screen.queryByText("company.teams.deleteTitle")).toBeNull();
    expect(h.mutate).not.toHaveBeenCalled();
  });
});

describe("CompanyTeamsCard create", () => {
  const openForm = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "company.teams.newTeam" }));
    return screen.getByRole("button", { name: "common.create" });
  };

  it("the form is collapsed until 'new team' is clicked", async () => {
    const user = userEvent.setup();
    renderCard();
    expect(screen.queryByRole("button", { name: "common.create" })).toBeNull();
    await openForm(user);
    expect(screen.getByRole("button", { name: "common.create" })).toBeInTheDocument();
  });

  const validation = [
    { name: "name and admin are required", desc: "", want: ["company.teams.nameRequired", "company.teams.adminRequired"] },
    { name: "description is capped at 500 chars", desc: "x".repeat(501), want: ["common.maxChars"] },
  ];
  for (const tt of validation) {
    it(tt.name, async () => {
      const user = userEvent.setup();
      renderCard();
      const submit = await openForm(user);
      if (tt.desc) {
        // paste rather than type: 501 keystrokes is needlessly slow.
        await user.click(screen.getByRole("textbox", { name: "common.description" }));
        await user.paste(tt.desc);
      }
      await user.click(submit);
      for (const msg of tt.want) {
        expect(await screen.findByText(msg)).toBeInTheDocument();
      }
      expect(h.mutate).not.toHaveBeenCalled();
    });
  }

  const tests = [
    { name: "success toasts, resets and refetches", outcome: "success" as const },
    { name: "error toasts the failure and keeps the input", outcome: "error" as const },
  ];
  for (const tt of tests) {
    it(tt.name, async () => {
      h.outcome = tt.outcome;
      const user = userEvent.setup();
      renderCard();
      const submit = await openForm(user);
      const name = screen.getByRole("textbox", { name: "common.name" });
      await user.type(name, "Payments");
      await user.click(screen.getByRole("combobox"));
      await user.click(await screen.findByRole("option", { name: /jane@acme\.com/ }));
      expect(screen.getByRole("combobox")).toHaveTextContent("Jane (jane@acme.com)");
      await user.click(submit);

      expect(lastCall()).toMatchObject({
        url: expect.stringMatching(/\/companies\/c1\/teams$/),
        method: "post",
        values: { name: "Payments", description: "", adminEmail: "jane@acme.com" },
      });
      if (tt.outcome === "success") {
        expect(h.toastSuccess).toHaveBeenCalledWith("company.teams.created");
        expect(h.refetch).toHaveBeenCalled();
        expect(name).toHaveValue("");
      } else {
        expect(h.toastError).toHaveBeenCalledWith("company.teams.createError", { description: "boom" });
        expect(name).toHaveValue("Payments");
      }
    });
  }
});
