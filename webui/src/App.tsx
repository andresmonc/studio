import type { ReactNode } from "react";
import { Authenticated, Refine } from "@refinedev/core";
import { DevtoolsPanel, DevtoolsProvider } from "@refinedev/devtools";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";

import routerProvider, {
  DocumentTitleHandler,
  UnsavedChangesNotifier,
} from "@refinedev/react-router";
import { BrowserRouter, Outlet, Route, Routes } from "react-router";
import {
  Building2Icon,
  FlagIcon,
  ScrollTextIcon,
  SettingsIcon,
  ToggleLeftIcon,
} from "lucide-react";
import "./App.css";
import "./i18n";
import { Layout } from "./components/refine-ui/layout/layout";
import { Toaster } from "./components/refine-ui/notification/toaster";
import { useNotificationProvider } from "./components/refine-ui/notification/use-notification-provider";
import { ThemeProvider } from "./components/refine-ui/theme/theme-provider";
import { OnboardingGuard } from "./components/onboarding-guard";
import { RbacRoute } from "./components/rbac-route";
import { ActiveCompanyProvider } from "./hooks/use-active-company";
import { ActiveTeamProvider } from "./hooks/use-active-team";
import { accessControlProvider } from "./providers/access-control";
import { i18nProvider } from "./providers/i18n";
import { authProvider } from "./providers/auth";
import { dataProvider } from "./providers/data";
import { HomeRoute } from "./pages/home/home-route";
import { LoginPage } from "./pages/login";
import { OnboardingChoicePage } from "./pages/onboarding/choice";
import { OnboardingCreateCompanyPage } from "./pages/onboarding/create-company";
import { OnboardingJoinPage } from "./pages/onboarding/join";
import { OnboardingSetupPage } from "./pages/onboarding/setup";
import { CompanyListPage } from "./pages/companies/list";
import { CompanyCreatePage } from "./pages/companies/create";
import { CompanyEditPage } from "./pages/companies/edit";
import { CompanyPage } from "./pages/company/page";
import { TeamDetailPage } from "./pages/company/team-detail";
import { ProfilePage } from "./pages/profile";
import { FlagsetsPage } from "./pages/flagsets";
import { FlagsetSettingsPage } from "./pages/flagsets/settings";
import { FlagsPage } from "./pages/flags";
import { FlagDetailPage } from "./pages/flags/detail";
import { AuditLogPage } from "./pages/audit-log";

// Refine devtools are development-only. Gating on the statically-replaced
// `import.meta.env.DEV` lets the bundler tree-shake @refinedev/devtools out of
// production builds entirely, so the devtools client/UI — which would otherwise
// leak API request/response shapes and app internals — never ships to users.
function AppDevtools({ children }: { children: ReactNode }) {
  if (!import.meta.env.DEV) {
    return <>{children}</>;
  }
  return (
    <DevtoolsProvider>
      {children}
      <DevtoolsPanel />
    </DevtoolsProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <ThemeProvider>
          <AppDevtools>
            <Refine
              dataProvider={dataProvider}
              authProvider={authProvider}
              accessControlProvider={accessControlProvider}
              i18nProvider={i18nProvider}
              notificationProvider={useNotificationProvider()}
              routerProvider={routerProvider}
              resources={[
                {
                  name: "Workspace",
                  meta: {
                    label: "Workspace",
                    i18nKey: "nav.workspace",
                    group: true,
                    requiresActiveCompany: true,
                  },
                },
                {
                  name: "flags",
                  list: "/flags",
                  meta: {
                    label: "Flags",
                    i18nKey: "nav.flags",
                    icon: <ToggleLeftIcon />,
                    parent: "Workspace",
                    requiresActiveCompany: true,
                  },
                },
                {
                  name: "flagsets",
                  list: "/flagsets",
                  meta: {
                    label: "Flagsets",
                    i18nKey: "nav.flagsets",
                    icon: <FlagIcon />,
                    parent: "Workspace",
                    requiresActiveCompany: true,
                  },
                },
                {
                  name: "audit-log",
                  list: "/audit-log",
                  meta: {
                    label: "Audit log",
                    i18nKey: "nav.auditLog",
                    icon: <ScrollTextIcon />,
                    parent: "Workspace",
                    requiresActiveCompany: true,
                  },
                },
                {
                  name: "company",
                  list: "/company",
                  meta: {
                    label: "Company",
                    i18nKey: "nav.company",
                    icon: <SettingsIcon />,
                    requiresCompanyAdmin: true,
                    requiresActiveCompany: true,
                  },
                },
                {
                  name: "Admin",
                  meta: {
                    label: "Admin",
                    i18nKey: "nav.admin",
                    group: true,
                    requiresSuperAdmin: true,
                  },
                },
                {
                  name: "companies",
                  list: "/companies",
                  create: "/companies/create",
                  edit: "/companies/:id/edit",
                  meta: {
                    label: "Companies",
                    i18nKey: "nav.companies",
                    icon: <Building2Icon />,
                    canDelete: true,
                    parent: "Admin",
                    requiresSuperAdmin: true,
                  },
                },
              ]}
              options={{
                syncWithLocation: true,
                warnWhenUnsavedChanges: true,
                projectId: "woW2xm-RcGTKp-nEVscy",
                title: {
                  text: "GO Feature Flag",
                  icon: null,
                },
              }}
            >
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                  path="/onboarding"
                  element={
                    <Authenticated
                      key="onboarding"
                      redirectOnFail="/login"
                      fallback={<LoginPage />}
                    >
                      <Outlet />
                    </Authenticated>
                  }
                >
                  <Route index element={<OnboardingChoicePage />} />
                  <Route
                    path="create-company"
                    element={<OnboardingCreateCompanyPage />}
                  />
                  <Route path="join" element={<OnboardingJoinPage />} />
                  <Route path="setup" element={<OnboardingSetupPage />} />
                </Route>
                <Route
                  element={
                    <Authenticated
                      key="protected"
                      redirectOnFail="/login"
                      fallback={<LoginPage />}
                    >
                      <OnboardingGuard>
                        <ActiveCompanyProvider>
                          <ActiveTeamProvider>
                            <Layout>
                              <Outlet />
                            </Layout>
                          </ActiveTeamProvider>
                        </ActiveCompanyProvider>
                      </OnboardingGuard>
                    </Authenticated>
                  }
                >
                  <Route index element={<HomeRoute />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route
                    path="/flags"
                    element={
                      <RbacRoute resource="flags" action="list">
                        <FlagsPage />
                      </RbacRoute>
                    }
                  />
                  <Route
                    path="/flags/:id"
                    element={
                      <RbacRoute resource="flags" action="show">
                        <FlagDetailPage />
                      </RbacRoute>
                    }
                  />
                  <Route
                    path="/audit-log"
                    element={
                      <RbacRoute resource="audit-log" action="list">
                        <AuditLogPage />
                      </RbacRoute>
                    }
                  />
                  <Route
                    path="/flagsets"
                    element={
                      <RbacRoute resource="flagsets" action="list">
                        <FlagsetsPage />
                      </RbacRoute>
                    }
                  />
                  <Route
                    path="/flagsets/:id"
                    element={
                      <RbacRoute resource="flagsets" action="show">
                        <FlagsetSettingsPage />
                      </RbacRoute>
                    }
                  />
                  <Route path="/company">
                    <Route
                      index
                      element={
                        <RbacRoute resource="company" action="list">
                          <CompanyPage section="details" />
                        </RbacRoute>
                      }
                    />
                    <Route
                      path="members"
                      element={
                        <RbacRoute resource="company" action="list">
                          <CompanyPage section="members" />
                        </RbacRoute>
                      }
                    />
                    <Route
                      path="relay-proxy"
                      element={
                        <RbacRoute resource="company" action="list">
                          <CompanyPage section="relayProxy" />
                        </RbacRoute>
                      }
                    />
                    <Route path="teams">
                      <Route
                        index
                        element={
                          <RbacRoute resource="company" action="list">
                            <CompanyPage section="teams" />
                          </RbacRoute>
                        }
                      />
                      <Route
                        path=":teamId"
                        element={
                          <RbacRoute resource="team-detail" action="show">
                            <TeamDetailPage />
                          </RbacRoute>
                        }
                      />
                    </Route>
                  </Route>
                  <Route path="/companies">
                    <Route
                      index
                      element={
                        <RbacRoute resource="companies" action="list">
                          <CompanyListPage />
                        </RbacRoute>
                      }
                    />
                    <Route
                      path="create"
                      element={
                        <RbacRoute resource="companies" action="create">
                          <CompanyCreatePage />
                        </RbacRoute>
                      }
                    />
                    <Route
                      path=":id/edit"
                      element={
                        <RbacRoute resource="companies" action="edit">
                          <CompanyEditPage />
                        </RbacRoute>
                      }
                    />
                  </Route>
                </Route>
              </Routes>
              <Toaster />
              <RefineKbar />
              <UnsavedChangesNotifier />
              <DocumentTitleHandler
                handler={({ autoGeneratedTitle }) =>
                  autoGeneratedTitle.replace(/Refine$/, "GO Feature Flag Studio")
                }
              />
            </Refine>
          </AppDevtools>
        </ThemeProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
