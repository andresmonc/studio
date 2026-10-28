import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { ReactNode } from "react";

type CanAccessProps = {
  resource: string;
  action: string;
  params?: { id?: string };
  fallback: ReactNode;
  onUnauthorized: (r: { reason?: string }) => void;
  children: ReactNode;
};

const h = vi.hoisted(() => ({
  allowed: true,
  reason: undefined as string | undefined,
  lastProps: null as CanAccessProps | null,
  toastError: vi.fn(),
}));

vi.mock("@refinedev/core", () => ({
  useTranslate:
    () =>
    (key: string, options?: unknown, defaultMessage?: string): string =>
      `${key}|${typeof options === "string" ? options : (defaultMessage ?? "")}`,
  CanAccess: (props: CanAccessProps) => {
    h.lastProps = props;
    if (h.allowed) return <>{props.children}</>;
    props.onUnauthorized({ reason: h.reason });
    return <>{props.fallback}</>;
  },
}));
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => h.toastError(...a) },
}));

import { RbacRoute } from "./rbac-route";

function renderAt(path: string, pattern: string, redirectTo?: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={pattern}
          element={
            <RbacRoute resource="teams" action="edit" redirectTo={redirectTo}>
              <div>protected</div>
            </RbacRoute>
          }
        />
        <Route path="/" element={<div>home</div>} />
        <Route path="/denied" element={<div>denied</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RbacRoute", () => {
  beforeEach(() => {
    h.allowed = true;
    h.reason = undefined;
    h.lastProps = null;
    h.toastError.mockClear();
  });

  const paramTests: {
    name: string;
    path: string;
    pattern: string;
    wantParams: { id: string } | undefined;
  }[] = [
    { name: "teamId param", path: "/teams/t1/x", pattern: "/teams/:teamId/x", wantParams: { id: "t1" } },
    { name: "id param", path: "/flags/f1", pattern: "/flags/:id", wantParams: { id: "f1" } },
    { name: "no param", path: "/settings", pattern: "/settings", wantParams: undefined },
  ];

  for (const tt of paramTests) {
    it(`allowed with ${tt.name} renders children and forwards params`, () => {
      renderAt(tt.path, tt.pattern);
      expect(screen.getByText("protected")).toBeInTheDocument();
      expect(h.lastProps).toMatchObject({ resource: "teams", action: "edit" });
      expect(h.lastProps?.params).toEqual(tt.wantParams);
      expect(h.toastError).not.toHaveBeenCalled();
    });
  }

  const deniedTests: {
    name: string;
    reason?: string;
    redirectTo?: string;
    wantPage: string;
    wantDescription: string;
  }[] = [
    {
      name: "without a reason redirects home with the generic message",
      wantPage: "home",
      wantDescription: "rbac.accessDenied|Access denied.",
    },
    {
      name: "with a reason translates it and honors redirectTo",
      reason: "rbac.reason.viewer",
      redirectTo: "/denied",
      wantPage: "denied",
      wantDescription: "rbac.reason.viewer|Access denied.",
    },
  ];

  for (const tt of deniedTests) {
    it(`denied ${tt.name}`, () => {
      h.allowed = false;
      h.reason = tt.reason;
      renderAt("/settings", "/settings", tt.redirectTo);
      expect(screen.getByText(tt.wantPage)).toBeInTheDocument();
      expect(screen.queryByText("protected")).toBeNull();
      expect(h.toastError).toHaveBeenCalledWith("rbac.forbidden|Forbidden", {
        description: tt.wantDescription,
      });
    });
  }
});
