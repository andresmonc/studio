import type { AccessControlProvider, CanReturnType } from "@refinedev/core";
import { getCachedCompany, getCachedMembership, getCachedUser } from "./auth";
import type { Role } from "@/types/api";

export type ResourceAccessMeta = {
  requiresSuperAdmin?: boolean;
  requiresCompanyAdmin?: boolean;
  requiresActiveCompany?: boolean;
};

const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

function maxRole(a?: Role, b?: Role): Role | undefined {
  if (!a) return b;
  if (!b) return a;
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

// effectiveTeamRole = max(explicit team role, inherited company role).
// Only a company *admin* inherits a team role (admin on every team); a plain
// company "member" inherits nothing and must be explicitly added to a team.
export function effectiveTeamRole(teamId?: string): Role | undefined {
  const companyRole = getCachedCompany()?.role;
  const inherited: Role | undefined =
    companyRole === "admin" ? "admin" : undefined;
  const explicit = getCachedMembership()?.find(
    (m) => m.teamId === teamId,
  )?.role;
  return maxRole(explicit, inherited);
}

export function canEditTeam(teamId?: string): boolean {
  return (
    !!getCachedUser()?.isSuperAdmin || effectiveTeamRole(teamId) === "admin"
  );
}

function canTeamDetail(action: string, teamId?: string): CanReturnType {
  const user = getCachedUser();
  if (!user) {
    return { can: false, reason: "rbac.notAuthenticated" };
  }
  const mutating =
    action === "create" || action === "edit" || action === "delete";
  if (mutating) {
    return canEditTeam(teamId)
      ? { can: true }
      : { can: false, reason: "rbac.teamAdmin" };
  }
  if (user.isSuperAdmin || effectiveTeamRole(teamId)) {
    return { can: true };
  }
  return { can: false, reason: "rbac.notMember" };
}

export function canSync(
  action: string,
  meta: ResourceAccessMeta = {},
): CanReturnType {
  const user = getCachedUser();
  const company = getCachedCompany();

  if (!user) {
    return { can: false, reason: "rbac.notAuthenticated" };
  }

  if (meta.requiresSuperAdmin && !user.isSuperAdmin) {
    return { can: false, reason: "rbac.superAdmin" };
  }
  if (
    meta.requiresCompanyAdmin &&
    !user.isSuperAdmin &&
    company?.role !== "admin"
  ) {
    return { can: false, reason: "rbac.companyAdmin" };
  }
  if (meta.requiresActiveCompany && !user.isSuperAdmin && !company) {
    return { can: false, reason: "rbac.activeCompany" };
  }

  if (!user.isSuperAdmin) {
    // Company roles are {admin, member}. A non-admin member is read-only at
    // company scope; only admins may mutate.
    const role = company?.role;
    const mutating =
      action === "create" || action === "edit" || action === "delete";
    if (mutating && role !== "admin") {
      return { can: false, reason: "rbac.readOnly" };
    }
  }

  return { can: true };
}

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action, params }) => {
    if (resource === "team-detail") {
      return canTeamDetail(action, params?.id as string | undefined);
    }
    return canSync(action, (params?.resource?.meta ?? {}) as ResourceAccessMeta);
  },
  options: {
    buttons: {
      enableAccessControl: true,
      hideIfUnauthorized: true,
    },
  },
};
