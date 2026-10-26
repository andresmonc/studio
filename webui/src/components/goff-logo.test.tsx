import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GoffLogo } from "./goff-logo";

describe("GoffLogo", () => {
  it("renders the logo with alt text and forwards props", () => {
    render(<GoffLogo className="h-6" data-testid="logo" />);
    const img = screen.getByRole("img", { name: "GO Feature Flag" });
    expect(img).toHaveAttribute("src", expect.stringContaining("gofeatureflag"));
    expect(img).toHaveClass("h-6");
    expect(img).toHaveAttribute("data-testid", "logo");
  });
});
