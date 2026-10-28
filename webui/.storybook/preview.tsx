import {
  type AuthProvider,
  type DataProvider,
  Refine,
} from "@refinedev/core";
import routerProvider from "@refinedev/react-router";
import type { Decorator, Preview } from "@storybook/react-vite";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router";

import { Toaster } from "../src/components/notification/toaster";
import {
  ThemeProvider,
  useTheme,
} from "../src/components/theme/theme-provider";
import { ActiveCompanyProvider } from "../src/hooks/use-active-company";
import { ActiveTeamProvider } from "../src/hooks/use-active-team";
import {
  clearCachedUser,
  getCachedUser,
  seedCachedIdentity,
} from "../src/providers/auth";
import { i18nProvider } from "../src/providers/i18n";
import type { MeResponse } from "../src/types/api";
import {
  API_KEYS,
  AUDIT_ENTRIES,
  COMPANIES,
  COMPANY_MEMBERS,
  FAILED,
  FLAG,
  FLAG_INSTANCES,
  FLAG_OWNERS,
  FLAG_VERSIONS,
  FLAGSETS,
  LOADING,
  paginated,
  TAGS,
  TEAM_MEMBERS,
  TEAMS,
} from "./fixtures";
import "../src/App.css"; // Tailwind v4 entry + OKLch design tokens + .dark variant

type ThemeName = "light" | "dark";

const notUsed = () => Promise.reject(new Error("not used in stories"));

type DataRoutes = Record<string, unknown>;

/**
 * GET responses served to stories, matched on URL suffix (first match wins).
 * A story overrides any of them, or forces LOADING / FAILED, through
 * `parameters: { data: { "<suffix>": … } }`.
 */
const ROUTES: DataRoutes = {
  "/companies": COMPANIES,
  "/companies/acme": COMPANIES[0],
  "/companies/acme/members": COMPANY_MEMBERS,
  "/teams": TEAMS,
  "/teams/t-core": TEAMS[0],
  "/teams/t-core/members": TEAM_MEMBERS,
  "/teams/t-core/addable-members": COMPANY_MEMBERS,
  "/teams/t-core/tags": TAGS,
  "/teams/t-core/owners": FLAG_OWNERS,
  "/teams/t-core/flags?page=1&pageSize=50": paginated(FLAG_INSTANCES),
  "/teams/t-core/flags?pageSize=200": paginated(FLAG_INSTANCES),
  "/audit?teamId=t-core&page=1&pageSize=50": paginated(AUDIT_ENTRIES),
  "/flagsets": FLAGSETS,
  "/flagsets/fs-web": FLAGSETS[0],
  "/flagsets/fs-web/api-keys": API_KEYS,
  "/flags/f-checkout": FLAG,
  "/flags/f-checkout/versions": paginated(FLAG_VERSIONS),
};

const EVALUATION = {
  value: true,
  variationType: "enabled",
  reason: "TARGETING_MATCH",
  failed: false,
  trackEvents: true,
  cacheable: true,
};

function respond(url: string, overrides: DataRoutes) {
  for (const routes of [overrides, ROUTES]) {
    const suffix = Object.keys(routes).find((s) => url.endsWith(s));
    if (suffix === undefined) continue;
    const data = routes[suffix];
    if (data === LOADING) return new Promise<never>(() => {});
    if (data === FAILED) return Promise.reject(new Error(`story: ${url} failed`));
    return Promise.resolve({ data } as never);
  }
  return notUsed();
}

/**
 * Stories never talk to the API: the data provider serves fixtures for the
 * reads storied components make (plus EvaluatePanel's evaluate) and rejects
 * everything else, writes included, loudly.
 */
const storyDataProvider = (overrides: DataRoutes = {}): DataProvider => ({
  getApiUrl: () => "",
  getList: ({ resource }) =>
    respond(`/${resource}`, overrides).then(({ data }) => ({
      data,
      total: (data as unknown[]).length,
    })) as never,
  getOne: ({ resource, id }) => respond(`/${resource}/${id}`, overrides),
  create: notUsed,
  update: notUsed,
  deleteOne: notUsed,
  custom: ({ url, method }) => {
    if (url.endsWith("/evaluate")) return Promise.resolve({ data: EVALUATION } as never);
    return method === "get" ? respond(url, overrides) : notUsed();
  },
});

// Fail fast: without this React Query retries a FAILED request 3 times (~7s)
// before the story reaches its error state. Module-level so Refine's memoized
// QueryClient isn't rebuilt on every render.
const reactQuery = {
  clientConfig: { defaultOptions: { queries: { retry: false } } },
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

  // Pages read their URL (params, search) from `parameters.route`, e.g.
  // { path: "/flags/:id", url: "/flags/f-checkout" }.
  const route = context.parameters.route as
    | { path: string; url: string }
    | undefined;

  return (
    <ThemeProvider defaultTheme={theme}>
      <ForceTheme theme={theme}>
        {/* Keyed per story: Storybook reuses the React tree across stories,
            which would keep Refine's query cache (and identity) from the last one. */}
        <MemoryRouter key={context.id} initialEntries={[route?.url ?? "/"]}>
          <Refine
            authProvider={storyAuthProvider}
            // Same router binding as the app: Refine's links and navigation
            // go through react-router (a bare <a> would get `replace` props).
            routerProvider={routerProvider}
            dataProvider={storyDataProvider(
              context.parameters.data as DataRoutes | undefined,
            )}
            i18nProvider={i18nProvider}
            options={{ disableTelemetry: true, reactQuery }}
          >
            <ActiveCompanyProvider>
              <ActiveTeamProvider>
                <div className="bg-background text-foreground min-h-[6rem] p-8">
                  {route ? (
                    <Routes>
                      <Route path={route.path} element={<Story />} />
                    </Routes>
                  ) : (
                    <Story />
                  )}
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
