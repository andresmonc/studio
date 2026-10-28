import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GoffLogo } from "./goff-logo";

describe("GoffLogo", () => {
  it("renders the logo with alt text and forwards props to the badge", () => {
    render(<GoffLogo className="size-6" data-testid="logo" />);
    const img = screen.getByRole("img", { name: "GO Feature Flag" });
    expect(img).toHaveAttribute("src", expect.stringContaining("gofeatureflag"));
    const badge = screen.getByTestId("logo");
    expect(badge).toContainElement(img);
    expect(badge).toHaveClass("size-6", "rounded-full");
    expect(badge.style.background).toContain("repeating-linear-gradient");
    expect(screen.queryByText("GO Feature Flag")).not.toBeInTheDocument();
  });

  it("drops the striped circle when withCircle is false", () => {
    render(<GoffLogo withCircle={false} data-testid="logo" />);
    const badge = screen.getByTestId("logo");
    expect(badge).not.toHaveClass("rounded-full");
    expect(badge.style.background).toBe("");
    expect(screen.getByRole("img")).toHaveClass("w-full");
  });

  it("shows the name next to the badge and hides the image from screen readers", () => {
    render(<GoffLogo withText />);
    expect(screen.getByText("GO Feature Flag")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("merges textClassName into the name", () => {
    render(<GoffLogo withText textClassName="md:text-lg" />);
    expect(screen.getByText("GO Feature Flag")).toHaveClass(
      "font-semibold",
      "md:text-lg",
    );
    expect(screen.getByText("GO Feature Flag")).not.toHaveClass("md:text-2xl");
  });
});
