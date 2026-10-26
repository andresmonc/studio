import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useGetIdentity: () => ({ data: { email: "dev@local" } }),
  useLogout: () => ({ mutate: vi.fn() }),
}));

const refreshIdentity = vi.fn();
vi.mock("@/providers/auth", () => ({
  refreshIdentity: () => refreshIdentity(),
}));

const mono = vi.hoisted(() => ({ value: false }));
vi.mock("@/providers/ui-config", () => ({ isMonoCompany: () => mono.value }));

import { OnboardingJoinPage } from "./join";

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/onboarding/join"]}>
      <Routes>
        <Route path="/onboarding/join" element={<OnboardingJoinPage />} />
        <Route path="/" element={<div>home page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OnboardingJoinPage", () => {
  beforeEach(() => refreshIdentity.mockReset());

  it("multi company: shows the join copy and Back", () => {
    mono.value = false;
    renderPage();
    expect(screen.getByText("onboarding.join.title")).toBeInTheDocument();
    expect(screen.getByText("common.back")).toBeInTheDocument();
    expect(screen.queryByText("onboarding.join.checkAgain")).toBeNull();
  });

  it("mono company: shows the waiting copy, Check again refreshes and goes home", async () => {
    mono.value = true;
    renderPage();
    expect(screen.getByText("onboarding.join.monoTitle")).toBeInTheDocument();
    expect(screen.getByText("dev@local")).toBeInTheDocument();
    expect(screen.queryByText("common.back")).toBeNull();

    await userEvent.click(screen.getByText("onboarding.join.checkAgain"));
    expect(refreshIdentity).toHaveBeenCalledOnce();
    expect(await screen.findByText("home page")).toBeInTheDocument();
  });
});
