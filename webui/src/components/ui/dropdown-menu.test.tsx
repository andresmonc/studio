import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

function renderMenu() {
  return render(
    <>
      <button>Before</button>
      <DropdownMenu>
        <DropdownMenuTrigger>Account</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Logout</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button>After</button>
    </>,
  );
}

describe("DropdownMenu keyboard", () => {
  const tests = [
    { name: "Tab closes the menu and moves past the trigger", key: "{Tab}", want: "After" },
    { name: "Shift+Tab closes the menu and moves before the trigger", key: "{Shift>}{Tab}{/Shift}", want: "Before" },
  ];
  it.each(tests)("$name", async ({ key, want }) => {
    const user = userEvent.setup();
    renderMenu();
    screen.getByRole("button", { name: "Account" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Profile" })).toHaveFocus());

    await user.keyboard(key);

    await waitFor(() => expect(screen.getByRole("button", { name: want })).toHaveFocus());
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("still opens and closes with the keyboard", async () => {
    const user = userEvent.setup();
    renderMenu();
    screen.getByRole("button", { name: "Account" }).focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account" })).toHaveFocus();
  });
});
