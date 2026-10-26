import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
}));

import { OnboardingChoicePage } from "./choice";

describe("OnboardingChoicePage", () => {
  const tests = [
    { name: "create goes to the company form", button: "onboarding.choice.createBtn", want: "create page" },
    { name: "join goes to the join page", button: "onboarding.choice.joinBtn", want: "join page" },
  ];
  for (const tt of tests) {
    it(tt.name, async () => {
      render(
        <MemoryRouter initialEntries={["/onboarding"]}>
          <Routes>
            <Route path="/onboarding" element={<OnboardingChoicePage />} />
            <Route path="/onboarding/create-company" element={<div>create page</div>} />
            <Route path="/onboarding/join" element={<div>join page</div>} />
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.getByText("onboarding.choice.title")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: tt.button }));
      expect(await screen.findByText(tt.want)).toBeInTheDocument();
    });
  }
});
