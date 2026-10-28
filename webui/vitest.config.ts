import { coverageConfigDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
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
        // Ex-refine-ui files: layout shell, view scaffolds, theme, notifications.
        "src/components/layout/{layout,header,breadcrumb}.tsx",
        "src/components/layout/sidebar/sidebar.tsx",
        "src/components/views/**",
        "src/components/theme/**",
        "src/components/notification/**",
        "src/App.tsx",
        "src/index.tsx",
      ],
    },
  },
});
