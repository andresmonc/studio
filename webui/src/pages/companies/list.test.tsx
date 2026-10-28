import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpError } from "@/providers/http";

const h = vi.hoisted(() => ({
  mono: false,
  isLoading: false,
  isPending: false,
  companies: [] as unknown[] | undefined,
  outcome: "success" as "success" | "error",
  deleteErr: undefined as unknown,
  mutate: vi.fn(),
  edit: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useList: () => ({ result: { data: h.companies }, query: { isLoading: h.isLoading } }),
  useNavigation: () => ({ edit: h.edit }),
  useDelete: () => ({ mutate: h.mutate, mutation: { isPending: h.isPending } }),
}));
vi.mock("@/providers/ui-config", () => ({ isMonoCompany: () => h.mono }));
vi.mock("@/components/views/list-view", () => ({
  ListView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ListViewHeader: ({ title, canCreate }: { title: string; canCreate: boolean }) => (
    <div>
      {title}
      {canCreate && <button>create</button>}
    </div>
  ),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => h.toastSuccess(...a),
    error: (...a: unknown[]) => h.toastError(...a),
  },
}));

import { CompanyListPage } from "./list";

const acme = {
  id: "11111111-aaaa-bbbb-cccc-000000000001",
  displayName: "Acme",
  description: "Rockets",
  createdAt: "2026-01-02T03:04:05Z",
};
const globex = { id: "22222222-aaaa-bbbb-cccc-000000000002", displayName: "Globex", description: "" };

beforeEach(() => {
  h.mono = false;
  h.isLoading = false;
  h.isPending = false;
  h.companies = [acme, globex];
  h.outcome = "success";
  h.deleteErr = new Error("boom");
  h.mutate.mockReset();
  h.mutate.mockImplementation((_vars, cbs) =>
    h.outcome === "success" ? cbs.onSuccess() : cbs.onError(h.deleteErr),
  );
  h.edit.mockReset();
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

describe("CompanyListPage list states", () => {
  const tests = [
    { name: "loading", isLoading: true, companies: [], want: "common.loading" },
    { name: "empty", isLoading: false, companies: [], want: "companies.list.empty" },
    { name: "missing data is treated as empty", isLoading: false, companies: undefined, want: "companies.list.empty" },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      h.isLoading = tt.isLoading;
      h.companies = tt.companies;
      render(<CompanyListPage />);
      expect(screen.getByText(tt.want)).toBeInTheDocument();
    });
  }

  it("renders each company with a short id and its created date", () => {
    render(<CompanyListPage />);
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Rockets")).toBeInTheDocument();
    expect(screen.getByText("Globex")).toBeInTheDocument();
    expect(screen.getByText("11111111")).toBeInTheDocument();
    expect(screen.getByText(new Date(acme.createdAt).toLocaleString())).toBeInTheDocument();
    expect(screen.queryByText("companies.list.empty")).toBeNull();
  });
});

describe("CompanyListPage create button", () => {
  const tests = [
    { name: "multi company: companies can be created", mono: false, wantCreate: true },
    { name: "mono company: no create button", mono: true, wantCreate: false },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      h.mono = tt.mono;
      render(<CompanyListPage />);
      expect(screen.queryByRole("button", { name: "create" }) !== null).toBe(tt.wantCreate);
    });
  }
});

describe("CompanyListPage actions", () => {
  it("edit navigates to the company", async () => {
    render(<CompanyListPage />);
    await userEvent.click(screen.getAllByRole("button", { name: "companies.list.editAria" })[1]);
    expect(h.edit).toHaveBeenCalledWith("companies", globex.id);
  });

  const tests = [
    { name: "success", outcome: "success" as const, err: undefined, wantSuccess: true, wantError: undefined },
    {
      name: "server error shows its message",
      outcome: "error" as const,
      err: new HttpError("company has teams", 409),
      wantSuccess: false,
      wantError: "company has teams",
    },
    {
      name: "network error shows the generic message",
      outcome: "error" as const,
      err: new Error("offline"),
      wantSuccess: false,
      wantError: "companies.list.deleteError",
    },
  ];
  for (const tt of tests) {
    it(`delete: ${tt.name}`, async () => {
      h.outcome = tt.outcome;
      h.deleteErr = tt.err;
      const user = userEvent.setup();
      render(<CompanyListPage />);
      await user.click(screen.getAllByRole("button", { name: "companies.list.deleteAria" })[0]);
      expect(await screen.findByText("companies.list.deleteTitle")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "common.delete" }));
      expect(h.mutate.mock.calls[0][0]).toEqual({ resource: "companies", id: acme.id });
      if (tt.wantSuccess) expect(h.toastSuccess).toHaveBeenCalledWith("companies.list.deleted");
      if (tt.wantError) expect(h.toastError).toHaveBeenCalledWith(tt.wantError);
      await waitFor(() => expect(screen.queryByText("companies.list.deleteTitle")).toBeNull());
    });
  }

  it("cancel closes the dialog without deleting", async () => {
    const user = userEvent.setup();
    render(<CompanyListPage />);
    await user.click(screen.getAllByRole("button", { name: "companies.list.deleteAria" })[0]);
    await user.click(await screen.findByRole("button", { name: "common.cancel" }));
    await waitFor(() => expect(screen.queryByText("companies.list.deleteTitle")).toBeNull());
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("disables the dialog buttons while deleting", async () => {
    h.isPending = true;
    const user = userEvent.setup();
    render(<CompanyListPage />);
    await user.click(screen.getAllByRole("button", { name: "companies.list.deleteAria" })[0]);
    expect(await screen.findByRole("button", { name: "common.deleting" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "common.cancel" })).toBeDisabled();
  });
});
