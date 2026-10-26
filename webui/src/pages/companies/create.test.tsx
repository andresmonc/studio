import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm as useRHForm } from "react-hook-form";
import { HttpError } from "@/providers/http";

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
}));

// A plain function, not vi.fn: vitest reports a spy's rejected promise as a
// test failure even when the component catches it.
let onFinish: (values: unknown) => Promise<unknown>;
let sent: unknown[];
let formLoading = false;
type Notify = (err?: unknown) => { message: string; type: string };
let refineCoreProps: { successNotification: Notify; errorNotification: Notify };
// Real react-hook-form underneath, with Refine's submit stubbed out.
vi.mock("@refinedev/react-hook-form", () => ({
  useForm: (opts: Parameters<typeof useRHForm>[0] & { refineCoreProps: typeof refineCoreProps }) => {
    refineCoreProps = opts.refineCoreProps;
    return {
      ...useRHForm(opts),
      refineCore: { onFinish: (v: unknown) => onFinish(v), formLoading },
    };
  },
}));

vi.mock("@/components/refine-ui/views/create-view", () => ({
  CreateView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CreateViewHeader: () => null,
}));

import { CompanyCreatePage } from "./create";

async function fill(email: string) {
  const user = userEvent.setup();
  render(<CompanyCreatePage />);
  await user.type(screen.getByPlaceholderText("companies.create.displayNamePlaceholder"), "Acme");
  if (email) await user.type(screen.getByPlaceholderText("companies.create.adminEmailPlaceholder"), email);
  await user.click(screen.getByRole("button", { name: "companies.create.submit" }));
}

describe("CompanyCreatePage", () => {
  beforeEach(() => {
    sent = [];
    onFinish = async (v) => sent.push(v);
    formLoading = false;
  });

  const tests = [
    { name: "sends the admin email", email: "jane@acme.com", wantSent: true, wantMsg: false },
    { name: "requires the admin email", email: "", wantSent: false, wantMsg: true },
    // type="email" makes the browser block the submit before zod runs.
    { name: "rejects a malformed admin email", email: "jane", wantSent: false, wantMsg: false },
  ];
  for (const tt of tests) {
    it(tt.name, async () => {
      await fill(tt.email);
      if (tt.wantSent) {
        await waitFor(() =>
          expect(sent).toEqual([{ displayName: "Acme", description: "", adminEmail: tt.email }]),
        );
      } else {
        if (tt.wantMsg) {
          expect(await screen.findByText("companies.create.adminEmailRequired")).toBeInTheDocument();
        }
        expect(sent).toEqual([]);
      }
    });
  }

  it("shows the server's adminEmail error on the field", async () => {
    onFinish = () =>
      Promise.reject(new HttpError("validation failed", 400, { adminEmail: ["company admin is required"] }));
    await fill("jane@acme.com");
    expect(await screen.findByText("company admin is required")).toBeInTheDocument();
  });

  it("disables the submit button while saving", () => {
    formLoading = true;
    render(<CompanyCreatePage />);
    expect(screen.getByRole("button", { name: "companies.create.submitting" })).toBeDisabled();
  });

  const notifications = [
    { name: "success", notify: () => refineCoreProps.successNotification(), want: { message: "companies.create.success", type: "success" } },
    {
      name: "server error keeps the server's message",
      notify: () => refineCoreProps.errorNotification(new HttpError("name taken", 409)),
      want: { message: "name taken", type: "error" },
    },
    {
      name: "error without a message falls back to the generic one",
      notify: () => refineCoreProps.errorNotification(undefined),
      want: { message: "companies.create.error", type: "error" },
    },
  ];
  for (const tt of notifications) {
    it(`notification: ${tt.name}`, () => {
      render(<CompanyCreatePage />);
      expect(tt.notify()).toEqual(tt.want);
    });
  }
});
