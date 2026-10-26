import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw-server";
import { API_URL } from "@/providers/constants";

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
}));

const h = vi.hoisted(() => ({
  refreshIdentity: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("@/providers/auth", () => ({
  refreshIdentity: () => h.refreshIdentity(),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => h.toastSuccess(...a),
    error: (...a: unknown[]) => h.toastError(...a),
  },
}));

import { OnboardingCreateCompanyPage } from "./create-company";

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/onboarding/create-company"]}>
      <Routes>
        <Route path="/onboarding/create-company" element={<OnboardingCreateCompanyPage />} />
        <Route path="/onboarding" element={<div>choice page</div>} />
        <Route path="/" element={<div>home page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function submit(name: string) {
  const user = userEvent.setup();
  if (name) await user.type(screen.getByLabelText("onboarding.createCompany.nameLabel"), name);
  await user.click(screen.getByRole("button", { name: "onboarding.createCompany.submit" }));
}

describe("OnboardingCreateCompanyPage", () => {
  beforeEach(() => {
    h.refreshIdentity.mockReset();
    h.toastSuccess.mockReset();
    h.toastError.mockReset();
  });

  it("creates the company, refreshes the identity and goes home", async () => {
    let body: unknown;
    server.use(
      http.post(`${API_URL}/onboarding/company`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { id: "c1" } }, { status: 201 });
      }),
    );
    renderPage();
    await submit("Acme");

    expect(await screen.findByText("home page")).toBeInTheDocument();
    expect(body).toEqual({ displayName: "Acme", description: "" });
    expect(h.refreshIdentity).toHaveBeenCalledOnce();
    expect(h.toastSuccess).toHaveBeenCalledWith("onboarding.createCompany.success");
  });

  it("requires a name", async () => {
    renderPage();
    await submit("");
    expect(await screen.findByText("onboarding.createCompany.nameRequired")).toBeInTheDocument();
  });

  const errors = [
    {
      name: "server field errors land on the field",
      respond: () =>
        HttpResponse.json(
          { message: "validation failed", errors: { displayName: ["already taken", "too short"] } },
          { status: 400 },
        ),
      wantToast: "validation failed",
      wantField: "already taken, too short",
    },
    {
      name: "network failure shows the generic error",
      respond: () => HttpResponse.error(),
      wantToast: "onboarding.createCompany.error",
      wantField: undefined,
    },
  ];
  for (const tt of errors) {
    it(tt.name, async () => {
      server.use(http.post(`${API_URL}/onboarding/company`, tt.respond));
      renderPage();
      await submit("Acme");

      await waitFor(() => expect(h.toastError).toHaveBeenCalledWith(tt.wantToast));
      if (tt.wantField) expect(screen.getByText(tt.wantField)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "onboarding.createCompany.submit" })).toBeEnabled();
      expect(h.refreshIdentity).not.toHaveBeenCalled();
    });
  }

  it("shows the submitting label while saving", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      http.post(`${API_URL}/onboarding/company`, async () => {
        await gate;
        return HttpResponse.json({ data: { id: "c1" } }, { status: 201 });
      }),
    );
    renderPage();
    await submit("Acme");
    expect(await screen.findByRole("button", { name: "onboarding.createCompany.submitting" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "common.back" })).toBeDisabled();
    release();
    expect(await screen.findByText("home page")).toBeInTheDocument();
  });

  it("Back returns to the choice page", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "common.back" }));
    expect(await screen.findByText("choice page")).toBeInTheDocument();
  });
});
