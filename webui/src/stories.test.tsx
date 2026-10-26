import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { act, render } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import preview from "../.storybook/preview";

// Smoke-render every story with the real preview decorators (theme, Refine,
// i18n), so a story broken by a component change fails CI instead of rotting.
// Annotations are applied here rather than in setup.ts so the preview's real
// @refinedev/core import never leaks into tests that mock it.
setProjectAnnotations(preview);

type StoryModule = Parameters<typeof composeStories>[0];

const modules = import.meta.glob<StoryModule>("./**/*.stories.tsx", {
  eager: true,
});

const cases = Object.entries(modules).flatMap(([file, mod]) =>
  Object.entries(composeStories(mod)).map(
    ([name, Story]) => [`${file} › ${name}`, Story as ComponentType] as const,
  ),
);

// Wait until the DOM stops changing, so async work (identity, data-provider
// fixtures) settles and the loaded state renders, not just the first frame.
// ponytail: heuristic; a story that loads slower than one quiet tick slips
// through. Switch to per-story play assertions if that ever matters.
async function settle() {
  let last = "";
  for (let i = 0; i < 200; i++) {
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
    const html = document.body.innerHTML;
    if (html === last) return;
    last = html;
  }
}

describe("stories", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, "error");
  });
  afterEach(() => {
    consoleError.mockRestore();
  });

  it("finds stories", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)("%s renders", async (_, Story) => {
    render(<Story />);
    await settle();
    // React reports bad keys, invalid DOM nesting, etc. via console.error.
    expect(consoleError).not.toHaveBeenCalled();
  });
});
