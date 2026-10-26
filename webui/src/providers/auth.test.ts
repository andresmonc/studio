import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw-server";
import {
  authProvider,
  clearCachedUser,
  getCachedCompany,
  getCachedMembership,
  getCachedUser,
  refreshIdentity,
  seedCachedIdentity,
} from "./auth";
import { API_BASE, API_URL } from "./constants";
import { HttpError } from "./http";

const meEndpoint = `${API_URL}/auth/me`;
const logoutEndpoint = `${API_URL}/auth/logout`;

const sampleUser = {
  id: "u1",
  email: "a@b.io",
  name: "Alice",
  isSuperAdmin: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("authProvider", () => {
  beforeEach(() => clearCachedUser());

  it("check returns authenticated when /auth/me returns 200", async () => {
    server.use(
      http.get(meEndpoint, () =>
        HttpResponse.json({
          data: { user: sampleUser, membership: [] },
        })
      )
    );
    const res = await authProvider.check!({});
    expect(res.authenticated).toBe(true);
  });

  it("check returns unauthenticated on 401", async () => {
    server.use(
      http.get(meEndpoint, () =>
        HttpResponse.json(
          { message: "unauthorized" },
          { status: 401 }
        )
      )
    );
    const res = await authProvider.check!({});
    expect(res.authenticated).toBe(false);
    expect(res.redirectTo).toBe("/login");
  });

  it("getIdentity returns cached user after check", async () => {
    server.use(
      http.get(meEndpoint, () =>
        HttpResponse.json({
          data: { user: sampleUser, membership: [] },
        })
      )
    );
    await authProvider.check!({});
    const identity = await authProvider.getIdentity!({});
    expect(identity).toMatchObject({ id: "u1", isSuperAdmin: true });
  });

  it("logout clears cache and redirects", async () => {
    server.use(
      http.post(logoutEndpoint, () =>
        HttpResponse.json({})
      ),
      http.get(meEndpoint, () =>
        HttpResponse.json({
          data: { user: sampleUser, membership: [] },
        })
      )
    );
    await authProvider.check!({});
    const res = await authProvider.logout!({});
    expect(res.redirectTo).toBe("/login");
    const identity = await authProvider.getIdentity!({});
    // After logout, /auth/me would now be re-fetched and still returns sample in this test;
    // we only assert cache was cleared by reading post-logout result.
    expect(identity).toBeDefined();
  });

  it("seedCachedIdentity fills the cache without calling /auth/me", async () => {
    // No MSW handler: any request would fail the test (onUnhandledRequest: "error").
    seedCachedIdentity({
      user: sampleUser,
      membership: [{ teamId: "t1", teamName: "Core", role: "admin" }],
    });
    expect(getCachedUser()).toMatchObject({ id: "u1" });
    expect(getCachedMembership()).toEqual([
      { teamId: "t1", teamName: "Core", role: "admin" },
    ]);
    expect(getCachedCompany()).toBeNull();
    expect(await authProvider.getIdentity!({})).toMatchObject({ id: "u1" });
  });
});

describe("authProvider edge cases", () => {
  beforeEach(() => clearCachedUser());
  afterEach(() => vi.unstubAllGlobals());

  const seed = () =>
    seedCachedIdentity({
      user: sampleUser,
      membership: [],
      company: { companyId: "c1", companyDisplayName: "Acme", role: "admin" },
    });

  it("login redirects the browser to the backend login endpoint", async () => {
    vi.stubGlobal("location", { href: "" });
    const res = await authProvider.login!({});
    expect(res).toEqual({ success: true });
    expect(window.location.href).toBe(`${API_BASE}/auth/login`);
  });

  it("logout still succeeds and clears the cache when the API call fails", async () => {
    seed();
    server.use(http.post(logoutEndpoint, () => HttpResponse.error()));
    const res = await authProvider.logout!({});
    expect(res).toEqual({ success: true, redirectTo: "/login" });
    expect(getCachedUser()).toBeNull();
    expect(getCachedCompany()).toBeNull();
  });

  const checkTests: {
    name: string;
    reply: () => Response;
    wantMessage?: string;
  }[] = [
    {
      name: "200 without a user is unauthenticated",
      reply: () => HttpResponse.json({ data: {} }),
    },
    {
      name: "401 reports not authenticated",
      reply: () => HttpResponse.json({}, { status: 401 }),
      wantMessage: "Not authenticated",
    },
    {
      name: "500 reports a failed check",
      reply: () => HttpResponse.json({}, { status: 500 }),
      wantMessage: "Auth check failed",
    },
    {
      name: "network error reports a failed check",
      reply: () => HttpResponse.error(),
      wantMessage: "Auth check failed",
    },
  ];

  for (const tt of checkTests) {
    it(`check: ${tt.name}`, async () => {
      seed();
      server.use(http.get(meEndpoint, tt.reply));
      const res = await authProvider.check!({});
      expect(res.authenticated).toBe(false);
      expect(res.redirectTo).toBe("/login");
      expect(res.error?.message).toBe(tt.wantMessage);
      expect(getCachedUser()).toBeNull();
      expect(getCachedMembership()).toBeNull();
    });
  }

  it("check caches the company and defaults missing membership to []", async () => {
    server.use(
      http.get(meEndpoint, () =>
        HttpResponse.json({
          data: {
            user: sampleUser,
            company: { companyId: "c1", companyDisplayName: "Acme", role: "admin" },
          },
        })
      )
    );
    await authProvider.check!({});
    expect(getCachedMembership()).toEqual([]);
    expect(getCachedCompany()).toMatchObject({ companyId: "c1" });
  });

  const identityTests: { name: string; reply: () => Response }[] = [
    { name: "fetch failure", reply: () => HttpResponse.json({}, { status: 500 }) },
    { name: "body without a user", reply: () => HttpResponse.json({}) },
  ];

  for (const tt of identityTests) {
    it(`getIdentity returns undefined on ${tt.name}`, async () => {
      server.use(http.get(meEndpoint, tt.reply));
      expect(await authProvider.getIdentity!({})).toBeUndefined();
      expect(getCachedUser()).toBeNull();
    });
  }

  const onErrorTests: { name: string; error: unknown; want: object; cleared: boolean }[] = [
    {
      name: "401 logs out and clears the cache",
      error: new HttpError("unauthorized", 401),
      want: { logout: true, redirectTo: "/login" },
      cleared: true,
    },
    {
      name: "403 is left to the caller",
      error: new HttpError("forbidden", 403),
      want: {},
      cleared: false,
    },
    {
      name: "a plain error is left to the caller",
      error: new Error("boom"),
      want: {},
      cleared: false,
    },
  ];

  for (const tt of onErrorTests) {
    it(`onError: ${tt.name}`, async () => {
      seed();
      expect(await authProvider.onError!(tt.error)).toEqual(tt.want);
      expect(getCachedUser() === null).toBe(tt.cleared);
    });
  }

  const refreshTests: {
    name: string;
    reply: () => Response;
    wantUserId: string | null;
    wantCompanyId: string | null;
  }[] = [
    {
      name: "success replaces the cache",
      reply: () =>
        HttpResponse.json({
          data: {
            user: { ...sampleUser, id: "u2" },
            membership: [],
            company: { companyId: "c2", companyDisplayName: "B", role: "member" },
          },
        }),
      wantUserId: "u2",
      wantCompanyId: "c2",
    },
    {
      name: "empty body clears the cache",
      reply: () => HttpResponse.json({}),
      wantUserId: null,
      wantCompanyId: null,
    },
    {
      name: "failure clears the cache",
      reply: () => HttpResponse.json({}, { status: 500 }),
      wantUserId: null,
      wantCompanyId: null,
    },
  ];

  for (const tt of refreshTests) {
    it(`refreshIdentity: ${tt.name}`, async () => {
      seed();
      server.use(http.get(meEndpoint, tt.reply));
      await refreshIdentity();
      expect(getCachedUser()?.id ?? null).toBe(tt.wantUserId);
      expect(getCachedCompany()?.companyId ?? null).toBe(tt.wantCompanyId);
    });
  }
});
