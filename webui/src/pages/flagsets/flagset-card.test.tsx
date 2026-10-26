import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import type { Flagset } from "@/types/api";

// Translate stub resolves real i18n keys so the stat labels ("flags",
// "enabled") render their human strings, matching the convention in
// settings-tab.test.tsx.
vi.mock("@refinedev/core", async () => {
  const en = (await import("@/i18n/locales/en.json")).default as Record<
    string,
    unknown
  >;
  const resolve = (key: string): unknown =>
    key.split(".").reduce<unknown>(
      (o, p) => (o && typeof o === "object" ? (o as never)[p] : undefined),
      en,
    );
  const t = (key: string) => {
    const s = resolve(key);
    return typeof s === "string" ? s : key;
  };
  return { useTranslate: () => t };
});

import { FlagsetCard } from "./flagset-card";

const flagset = (over: Partial<Flagset> = {}): Flagset =>
  ({
    id: "fs-1",
    teamId: "t-1",
    name: "Prod",
    description: "",
    apiKeyCount: 0,
    flagCount: 0,
    enabledFlagCount: 0,
    createdAt: "",
    updatedAt: "",
    ...over,
  }) as Flagset;

const renderCard = (fs: Flagset) =>
  render(
    <MemoryRouter>
      <FlagsetCard fs={fs} editable={false} onDelete={() => {}} />
    </MemoryRouter>,
  );

// Each <Stat> renders value + label as adjacent siblings; assert the value
// sits next to its label so we don't confuse the flags vs enabled stats.
const statValueFor = (label: string): string => {
  const labelEl = screen.getByText(label);
  const valueEl = labelEl.previousElementSibling;
  return valueEl?.textContent ?? "";
};

describe("FlagsetCard stats", () => {
  it("renders flagCount and enabledFlagCount from the flagset (the bug fix)", () => {
    renderCard(flagset({ flagCount: 7, enabledFlagCount: 3 }));
    expect(statValueFor("flags")).toBe("7");
    expect(statValueFor("enabled")).toBe("3");
  });

  it("renders zero counts as '0', not a dash or loading placeholder", () => {
    renderCard(flagset({ flagCount: 0, enabledFlagCount: 0 }));
    expect(statValueFor("flags")).toBe("0");
    expect(statValueFor("enabled")).toBe("0");
    // The pre-fix card hardcoded enabled to "—"; ensure that's gone.
    expect(screen.queryByText("…")).toBeNull();
  });

  it("shows the api key count in the footer", () => {
    renderCard(flagset({ apiKeyCount: 2, flagCount: 1, enabledFlagCount: 1 }));
    expect(screen.getByText("2")).toBeTruthy();
  });
});

describe("FlagsetCard interactions", () => {
  const renderRouted = (fs: Flagset, editable: boolean, onDelete = vi.fn()) =>
    render(
      <MemoryRouter initialEntries={["/flagsets"]}>
        <Routes>
          <Route
            path="/flagsets"
            element={<FlagsetCard fs={fs} editable={editable} onDelete={onDelete} />}
          />
          <Route path="/flagsets/:id" element={<div>SETTINGS PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    );

  it("navigates to the flagset settings on click", async () => {
    renderRouted(flagset({ id: "fs-42" }), false);
    await userEvent.click(screen.getByText("Prod"));
    expect(screen.getByText("SETTINGS PAGE")).toBeInTheDocument();
  });

  it("shows the created date when set", () => {
    renderRouted(flagset({ createdAt: "2026-01-02T00:00:00Z" }), false);
    expect(screen.getByText(/· created/)).toBeInTheDocument();
  });

  const tests = [
    { name: "read-only cards have no actions menu", editable: false, wantMenu: false },
    { name: "editable cards expose the actions menu", editable: true, wantMenu: true },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      renderRouted(flagset({}), tt.editable);
      expect(screen.queryByRole("button", { name: "Actions" }) !== null).toBe(tt.wantMenu);
    });
  }

  it("delete calls onDelete without navigating", async () => {
    const onDelete = vi.fn();
    const fs = flagset({ id: "fs-7" });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderRouted(fs, true, onDelete);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(fs);
    expect(screen.queryByText("SETTINGS PAGE")).toBeNull();
  });
});
