import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm as useRHForm } from "react-hook-form";

const h = vi.hoisted(() => ({
  isLoading: false,
  team: undefined as unknown,
  outcome: "success" as "success" | "error",
  mutate: vi.fn(),
  refetch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useCustom: () => ({
    query: { data: h.team ? { data: h.team } : undefined, isLoading: h.isLoading, refetch: h.refetch },
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

import { TeamDetailsCard } from "./team-details-card";

const team = { id: "t1", companyId: "c1", name: "Platform", description: "Core infra", createdAt: "", updatedAt: "" };

beforeEach(() => {
  h.isLoading = false;
  h.team = team;
  h.outcome = "success";
  h.mutate.mockReset();
  h.mutate.mockImplementation((_opts, cbs) =>
    h.outcome === "success" ? cbs.onSuccess() : cbs.onError(new Error("boom")),
  );
  h.refetch.mockReset();
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

const nameInput = () => screen.getByRole("textbox", { name: "common.name" });
const descInput = () => screen.getByRole("textbox", { name: "common.description" });
const saveBtn = () => screen.queryByRole("button", { name: "common.save" });

describe("TeamDetailsCard", () => {
  it("shows a loading state while the team is fetched", () => {
    h.isLoading = true;
    h.team = undefined;
    render(<TeamDetailsCard teamId="t1" editable />);
    expect(screen.getByText("common.loading")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  const access = [
    { name: "maintainer can edit", editable: true },
    { name: "viewer sees disabled fields and no save button", editable: false },
  ];
  for (const tt of access) {
    it(tt.name, () => {
      render(<TeamDetailsCard teamId="t1" editable={tt.editable} />);
      expect(nameInput()).toHaveValue("Platform");
      expect(descInput()).toHaveValue("Core infra");
      expect(nameInput()).toHaveProperty("disabled", !tt.editable);
      expect(descInput()).toHaveProperty("disabled", !tt.editable);
      expect(saveBtn() !== null).toBe(tt.editable);
    });
  }

  it("a null description is shown as empty", () => {
    h.team = { ...team, description: null };
    render(<TeamDetailsCard teamId="t1" editable />);
    expect(descInput()).toHaveValue("");
  });

  const validation = [
    { name: "name is required", name_: "", desc: "", want: "team.detail.nameRequired" },
    { name: "description is capped at 500 chars", name_: "Platform", desc: "x".repeat(501), want: "common.maxChars" },
  ];
  for (const tt of validation) {
    it(tt.name, async () => {
      const user = userEvent.setup();
      render(<TeamDetailsCard teamId="t1" editable />);
      await user.clear(nameInput());
      if (tt.name_) await user.type(nameInput(), tt.name_);
      await user.clear(descInput());
      if (tt.desc) {
        await user.click(descInput());
        await user.paste(tt.desc);
      }
      await user.click(saveBtn()!);
      expect(await screen.findByText(tt.want)).toBeInTheDocument();
      expect(h.mutate).not.toHaveBeenCalled();
    });
  }

  const tests = [
    { name: "save success toasts and refetches", outcome: "success" as const },
    { name: "save error toasts the failure", outcome: "error" as const },
  ];
  for (const tt of tests) {
    it(tt.name, async () => {
      h.outcome = tt.outcome;
      const user = userEvent.setup();
      render(<TeamDetailsCard teamId="t1" editable />);
      await user.clear(nameInput());
      await user.type(nameInput(), "Infra");
      await user.click(saveBtn()!);

      expect(h.mutate.mock.calls.at(-1)![0]).toMatchObject({
        url: expect.stringMatching(/\/teams\/t1$/),
        method: "patch",
        values: { name: "Infra", description: "Core infra" },
      });
      if (tt.outcome === "success") {
        expect(h.toastSuccess).toHaveBeenCalledWith("team.detail.updated");
        expect(h.refetch).toHaveBeenCalled();
      } else {
        expect(h.toastError).toHaveBeenCalledWith("team.detail.updateError", { description: "boom" });
        expect(h.refetch).not.toHaveBeenCalled();
      }
    });
  }
});
