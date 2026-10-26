import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// Drive the theme the hook reads.
const themeState = vi.hoisted(() => ({ theme: "light" as string }));
vi.mock("@/components/refine-ui/theme/theme-provider", () => ({
  useTheme: () => ({ theme: themeState.theme }),
}));

import { CodeBlock, REGISTERED_LANGUAGES } from "./code-block";

beforeEach(() => {
  themeState.theme = "light";
});

describe("CodeBlock", () => {
  it("registers the expected set of languages", () => {
    expect(REGISTERED_LANGUAGES).toContain("go");
    expect(REGISTERED_LANGUAGES).toContain("typescript");
    expect(REGISTERED_LANGUAGES).toContain("yaml");
    expect(REGISTERED_LANGUAGES).toContain("json");
    expect(REGISTERED_LANGUAGES.length).toBe(12);
  });

  it("renders the code under an explicit light theme", () => {
    themeState.theme = "light";
    const { container } = render(
      <CodeBlock code="const x = 1;" language="typescript" />,
    );
    expect(container.textContent).toContain("const x = 1;");
  });

  it("renders the code under an explicit dark theme", () => {
    themeState.theme = "dark";
    const { container } = render(
      <CodeBlock code="let y = 2" language="go" />,
    );
    expect(container.textContent).toContain("let y = 2");
  });

  it("renders under the system theme without throwing (matchMedia)", () => {
    themeState.theme = "system";
    expect(() =>
      render(<CodeBlock code="z := 3" language="go" />),
    ).not.toThrow();
  });

  it("removes the matchMedia change listener on unmount (system theme)", () => {
    themeState.theme = "system";
    const remove = vi.fn();
    const mql = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: remove,
    };
    const spy = vi
      .spyOn(window, "matchMedia")
      .mockReturnValue(mql as unknown as MediaQueryList);

    const { unmount } = render(<CodeBlock code="x" language="go" />);
    unmount();

    expect(remove).toHaveBeenCalled();
    spy.mockRestore();
  });
});
