import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./auth", () => ({
  getCachedUser: vi.fn(),
  getCachedCompany: vi.fn(),
  getCachedMembership: vi.fn(),
}));

import {
  getCachedCompany,
  getCachedMembership,
  getCachedUser,
} from "./auth";
import { accessControlProvider, canWriteTeam } from "./access-control";

const mockUser = getCachedUser as unknown as ReturnType<typeof vi.fn>;
const mockCompany = getCachedCompany as unknown as ReturnType<typeof vi.fn>;
const mockMembership =
  getCachedMembership as unknown as ReturnType<typeof vi.fn>;

function call(
  action: string,
  meta: Record<string, unknown> = {},
  resourceName = "x",
) {
  return accessControlProvider.can({
    resource: resourceName,
    action,
    params: { resource: { name: resourceName, meta } },
  });
}

function callTeam(action: string, teamId = "t1") {
  return accessControlProvider.can({
    resource: "team-detail",
    action,
    params: { id: teamId },
  });
}

describe("accessControlProvider.can", () => {
  beforeEach(() => {
    mockUser.mockReset();
    mockCompany.mockReset();
    mockMembership.mockReset();
    mockMembership.mockReturnValue(null);
  });

  it("denies when not authenticated", async () => {
    mockUser.mockReturnValue(null);
    const r = await call("list");
    expect(r).toEqual({ can: false, reason: "rbac.notAuthenticated" });
  });

  it("denies requiresSuperAdmin for non-super-admin", async () => {
    mockUser.mockReturnValue({ isSuperAdmin: false });
    mockCompany.mockReturnValue(null);
    const r = await call("list", { requiresSuperAdmin: true });
    expect(r.can).toBe(false);
    expect(r.reason).toBe("rbac.superAdmin");
  });

  it("allows requiresSuperAdmin for super admin", async () => {
    mockUser.mockReturnValue({ isSuperAdmin: true });
    mockCompany.mockReturnValue(null);
    const r = await call("list", { requiresSuperAdmin: true });
    expect(r).toEqual({ can: true });
  });

  it("denies requiresCompanyAdmin for member", async () => {
    mockUser.mockReturnValue({ isSuperAdmin: false });
    mockCompany.mockReturnValue({ role: "member" });
    const r = await call("list", { requiresCompanyAdmin: true });
    expect(r.can).toBe(false);
  });

  it("allows requiresCompanyAdmin for company admin", async () => {
    mockUser.mockReturnValue({ isSuperAdmin: false });
    mockCompany.mockReturnValue({ role: "admin" });
    const r = await call("list", { requiresCompanyAdmin: true });
    expect(r.can).toBe(true);
  });

  it("denies requiresActiveCompany when no company", async () => {
    mockUser.mockReturnValue({ isSuperAdmin: false });
    mockCompany.mockReturnValue(null);
    const r = await call("list", { requiresActiveCompany: true });
    expect(r.can).toBe(false);
  });

  it("denies member mutating actions, allows read", async () => {
    mockUser.mockReturnValue({ isSuperAdmin: false });
    mockCompany.mockReturnValue({ role: "member" });
    expect((await call("create")).can).toBe(false);
    expect((await call("edit")).can).toBe(false);
    expect((await call("delete")).can).toBe(false);
    expect((await call("list")).can).toBe(true);
  });

  it("allows admin all actions", async () => {
    mockUser.mockReturnValue({ isSuperAdmin: false });
    mockCompany.mockReturnValue({ role: "admin" });
    expect((await call("create")).can).toBe(true);
    expect((await call("edit")).can).toBe(true);
    expect((await call("delete")).can).toBe(true);
  });

  it("super admin bypasses role-based action checks", async () => {
    mockUser.mockReturnValue({ isSuperAdmin: true });
    mockCompany.mockReturnValue(null);
    expect((await call("delete")).can).toBe(true);
  });

  it("falls back to no meta when the resource has none", async () => {
    mockUser.mockReturnValue({ isSuperAdmin: false });
    mockCompany.mockReturnValue({ role: "member" });
    expect(await accessControlProvider.can({ resource: "x", action: "list" })).toEqual({ can: true });
  });

  describe("team-detail", () => {
    it("denies when not authenticated", async () => {
      mockUser.mockReturnValue(null);
      expect(await callTeam("show")).toEqual({ can: false, reason: "rbac.notAuthenticated" });
    });

    it("denies show to non-member with no company role", async () => {
      mockUser.mockReturnValue({ isSuperAdmin: false });
      mockCompany.mockReturnValue(null);
      mockMembership.mockReturnValue([]);
      const r = await callTeam("show");
      expect(r.can).toBe(false);
      expect(r.reason).toBe("rbac.notMember");
    });

    it("allows show to explicit team viewer", async () => {
      mockUser.mockReturnValue({ isSuperAdmin: false });
      mockCompany.mockReturnValue(null);
      mockMembership.mockReturnValue([{ teamId: "t1", role: "viewer" }]);
      expect((await callTeam("show")).can).toBe(true);
    });

    it("denies show to a company member with no team membership", async () => {
      mockUser.mockReturnValue({ isSuperAdmin: false });
      mockCompany.mockReturnValue({ role: "member" });
      mockMembership.mockReturnValue([]);
      const r = await callTeam("show");
      expect(r.can).toBe(false);
      expect(r.reason).toBe("rbac.notMember");
    });

    it("allows show to company admin (inherited)", async () => {
      mockUser.mockReturnValue({ isSuperAdmin: false });
      mockCompany.mockReturnValue({ role: "admin" });
      mockMembership.mockReturnValue([]);
      expect((await callTeam("show")).can).toBe(true);
    });

    it("denies edit to team viewer/editor", async () => {
      mockUser.mockReturnValue({ isSuperAdmin: false });
      mockCompany.mockReturnValue(null);
      mockMembership.mockReturnValue([{ teamId: "t1", role: "editor" }]);
      const r = await callTeam("edit");
      expect(r.can).toBe(false);
      expect(r.reason).toBe("rbac.teamAdmin");
    });

    it("allows edit to explicit team admin", async () => {
      mockUser.mockReturnValue({ isSuperAdmin: false });
      mockCompany.mockReturnValue(null);
      mockMembership.mockReturnValue([{ teamId: "t1", role: "admin" }]);
      expect((await callTeam("edit")).can).toBe(true);
    });

    it("allows edit to company admin (inherited)", async () => {
      mockUser.mockReturnValue({ isSuperAdmin: false });
      mockCompany.mockReturnValue({ role: "admin" });
      mockMembership.mockReturnValue([]);
      expect((await callTeam("edit")).can).toBe(true);
    });

    it("allows edit to super admin", async () => {
      mockUser.mockReturnValue({ isSuperAdmin: true });
      mockCompany.mockReturnValue(null);
      mockMembership.mockReturnValue([]);
      expect((await callTeam("edit")).can).toBe(true);
    });
  });
});

describe("canWriteTeam", () => {
  const tests = [
    { name: "no team", teamId: null, superAdmin: false, company: null, role: undefined, want: false },
    { name: "super admin", teamId: "t1", superAdmin: true, company: null, role: undefined, want: true },
    { name: "company admin (inherited)", teamId: "t1", superAdmin: false, company: { role: "admin" }, role: undefined, want: true },
    { name: "team admin", teamId: "t1", superAdmin: false, company: null, role: "admin", want: true },
    { name: "team editor", teamId: "t1", superAdmin: false, company: null, role: "editor", want: true },
    { name: "team viewer", teamId: "t1", superAdmin: false, company: null, role: "viewer", want: false },
    { name: "team admin in a company they admin", teamId: "t1", superAdmin: false, company: { role: "admin" }, role: "admin", want: true },
    { name: "team viewer in a company they admin", teamId: "t1", superAdmin: false, company: { role: "admin" }, role: "viewer", want: true },
    { name: "not a member", teamId: "t1", superAdmin: false, company: null, role: undefined, want: false },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      mockUser.mockReturnValue({ isSuperAdmin: tt.superAdmin });
      mockCompany.mockReturnValue(tt.company);
      mockMembership.mockReturnValue(tt.role ? [{ teamId: "t1", role: tt.role }] : []);
      expect(canWriteTeam(tt.teamId)).toBe(tt.want);
    });
  }
});
