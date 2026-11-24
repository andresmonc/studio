import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeProvider } from "./theme-provider";
import { ThemeSwitcher } from "./theme-switcher";

function renderInMenu() {
  return render(
    <ThemeProvider defaultTheme="light">
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Account</DropdownMenuTrigger>
        <DropdownMenuContent>
          <ThemeSwitcher />
          <DropdownMenuItem>Profile</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ThemeProvider>,
  );
}

describe("ThemeSwitcher", () => {
  beforeEach(() => localStorage.clear());

  it("is a radio group of menu items, so the menu's arrow keys reach it", () => {
    renderInMenu();
    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("menuitemradio").map((el) => el.getAttribute("aria-label")),
    ).toEqual(["Dark theme", "Light theme", "Use system setting"]);
    expect(screen.getByRole("menuitemradio", { checked: true })).toHaveAccessibleName(
      "Light theme",
    );
  });

  const tests = [
    { name: "picks dark from the keyboard", arrows: 1, key: "{Enter}", want: "dark", label: "Dark theme" },
    { name: "picks system from the keyboard", arrows: 3, key: " ", want: "system", label: "Use system setting" },
  ];
  it.each(tests)("$name and keeps the menu open", async ({ arrows, key, want, label }) => {
    const user = userEvent.setup();
    renderInMenu();
    for (let i = 0; i < arrows; i++) await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(document.activeElement).toHaveAccessibleName(label));

    await user.keyboard(key);

    expect(screen.getByRole("menuitemradio", { checked: true })).toHaveAccessibleName(label);
    expect(localStorage.getItem("refine-ui-theme")).toBe(want);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});
