import {
  type AuthProvider,
  type DataProvider,
  Refine,
} from "@refinedev/core";
import type { Decorator, Preview } from "@storybook/react-vite";
import { useEffect } from "react";
import { MemoryRouter } from "react-router";

import { Toaster } from "../src/components/refine-ui/notification/toaster";
import {
  ThemeProvider,
  useTheme,
} from "../src/components/refine-ui/theme/theme-provider";
import { ActiveCompanyProvider } from "../src/hooks/use-active-company";
import { ActiveTeamProvider } from "../src/hooks/use-active-team";
import {
  clearCachedUser,
  getCachedUser,
  seedCachedIdentity,
} from "../src/providers/auth";
import { i18nProvider } from "../src/providers/i18n";
import type { MeResponse } from "../src/types/api";
import { COMPANIES, TEAMS } from "./fixtures";
import "../src/App.css"; // Tailwind v4 entry + OKLch design tokens + .dark variant

type ThemeName = "light" | "dark";

const notUsed = () => Promise.reject(new Error("not used in stories"));

/**
 * Stories never talk to the API: the data provider serves fixtures for the
 * few calls storied components make (EvaluatePanel's evaluate, the company
 * teams and companies lists) and rejects everything else loudly.
 */
const storyDataProvider: DataProvider = {
  getApiUrl: () => "",
  getList: async ({ resource }) =>
    resource === "companies"
      ? ({ data: COMPANIES, total: COMPANIES.length } as never)
      : notUsed(),
  getOne: notUsed,
  create: notUsed,
  update: notUsed,
  deleteOne: notUsed,
  custom: async ({ url }) => {
    if (url.endsWith("/evaluate"))
      return {
        data: {
          value: true,
          variationType: "enabled",
          reason: "TARGETING_MATCH",
          failed: false,
          trackEvents: true,
          cacheable: true,
        },
      } as never;
    if (url.endsWith("/teams")) return { data: TEAMS } as never;
    return notUsed();
  },
};

// Identity comes from the auth cache, which withAppProviders seeds per story.
const storyAuthProvider: AuthProvider = {
  login: async () => ({ success: true }),
  logout: async () => ({ success: true }),
  check: async () => ({ authenticated: true }),
  onError: async () => ({}),
  getIdentity: async () => getCachedUser(),
};

/**
 * Drives the app's ThemeProvider from the Storybook toolbar. We reuse the real
 * provider (rather than addon-themes' `.dark` class toggle) because some
 * components — e.g. CodeBlock — read the theme from this context, not the CSS
 * class. The provider itself applies the `.dark` class to <html>, so plain
 * Tailwind components stay in sync too: one source of truth for both.
 */
function ForceTheme({
  theme,
  children,
}: {
  theme: ThemeName;
  children: React.ReactNode;
}) {
  const { theme: current, setTheme } = useTheme();
  useEffect(() => {
    if (current !== theme) setTheme(theme);
  }, [theme, current, setTheme]);
  return <>{children}</>;
}

const withAppProviders: Decorator = (Story, context) => {
  const theme = (context.globals.theme as ThemeName) ?? "light";

  // Each story starts from its own identity (`parameters.identity`), with no
  // team or company left selected by a previous story.
  const identity = context.parameters.identity as MeResponse | null | undefined;
  if (identity) seedCachedIdentity(identity);
  else clearCachedUser();
  localStorage.removeItem("activeTeamId");
  localStorage.removeItem("activeCompanyId");

  return (
    <ThemeProvider defaultTheme={theme}>
      <ForceTheme theme={theme}>
        {/* Keyed per story: Storybook reuses the React tree across stories,
            which would keep Refine's query cache (and identity) from the last one. */}
        <MemoryRouter key={context.id}>
          <Refine
            authProvider={storyAuthProvider}
            dataProvider={storyDataProvider}
            i18nProvider={i18nProvider}
            options={{ disableTelemetry: true }}
          >
            <ActiveCompanyProvider>
              <ActiveTeamProvider>
                <div className="bg-background text-foreground min-h-[6rem] p-8">
                  <Story />
                </div>
              </ActiveTeamProvider>
            </ActiveCompanyProvider>
            <Toaster />
          </Refine>
        </MemoryRouter>
      </ForceTheme>
    </ThemeProvider>
  );
};

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: { test: "todo" },
  },
  initialGlobals: { theme: "light" },
  globalTypes: {
    theme: {
      description: "Light / dark theme",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        dynamicTitle: true,
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
        ],
      },
    },
  },
  decorators: [withAppProviders],
};

export default preview;
