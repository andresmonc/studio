import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { coverageConfigDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Every story rendered in real Chromium, with the a11y addon running axe on it.
// One project per theme: dark mode has its own colors to check for contrast.
function storybookProject(theme: "light" | "dark") {
  return {
    extends: true,
    plugins: [storybookTest({ configDir: path.join(__dirname, ".storybook") })],
    // Read by .storybook/preview.tsx as the initial theme global.
    define: {
      "import.meta.env.VITE_STORYBOOK_THEME": JSON.stringify(theme),
    },
    test: {
      name: theme === "light" ? "storybook" : "storybook-dark",
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: [{ browser: "chromium" as const }],
      },
    },
  };
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Without this, build output (storybook-static/, dist/) built earlier in CI is counted at 0%.
      include: ["src/**"],
      exclude: [
        ...coverageConfigDefaults.exclude,
        "src/**/*.stories.tsx",
        "src/test/**",
        // Vendored from the shadcn and refine registries, plus app bootstrap wiring.
        "src/components/ui/**",
        "src/components/refine-ui/**",
        "src/App.tsx",
        "src/index.tsx",
      ],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/test/setup.ts"],
          css: false,
          // Run refine through Vite like app code. Left external, @refinedev/react-router
          // loads its own react-router instance and can't see the stories' MemoryRouter.
          server: { deps: { inline: [/@refinedev\//] } },
        },
      },
      storybookProject("light"),
      storybookProject("dark"),
    ],
  },
});
