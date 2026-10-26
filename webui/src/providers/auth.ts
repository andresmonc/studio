import type { AuthProvider } from "@refinedev/core";
import { API_BASE } from "./constants";
import { apiFetch, HttpError } from "./http";
import type {
  CompanyMembership,
  MeResponse,
  TeamMembership,
  User,
} from "@/types/api";

let cachedUser: User | null = null;
let cachedMembership: TeamMembership[] | null = null;
let cachedCompany: CompanyMembership | null = null;

export function getCachedUser(): User | null {
  return cachedUser;
}

export function getCachedMembership(): TeamMembership[] | null {
  return cachedMembership;
}

export function getCachedCompany(): CompanyMembership | null {
  return cachedCompany;
}

// seedCachedIdentity primes the identity cache without calling /auth/me, so
// Storybook can render identity-dependent components (switchers, user menu).
export function seedCachedIdentity(me: MeResponse): void {
  cachedUser = me.user;
  cachedMembership = me.membership;
  cachedCompany = me.company ?? null;
}

export function clearCachedUser(): void {
  cachedUser = null;
  cachedMembership = null;
  cachedCompany = null;
}

export const authProvider: AuthProvider = {
  login: async () => {
    window.location.href = `${API_BASE}/auth/login`;
    return { success: true };
  },

  logout: async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    cachedUser = null;
    cachedMembership = null;
    cachedCompany = null;
    return { success: true, redirectTo: "/login" };
  },

  check: async () => {
    try {
      const body = await apiFetch<MeResponse>("/auth/me");
      if (body.data?.user) {
        cachedUser = body.data.user;
        cachedMembership = body.data.membership ?? [];
        cachedCompany = body.data.company ?? null;
        return { authenticated: true };
      }
      cachedUser = null;
      cachedMembership = null;
      cachedCompany = null;
      return { authenticated: false, redirectTo: "/login" };
    } catch (err) {
      cachedUser = null;
      cachedMembership = null;
      cachedCompany = null;
      const status = err instanceof HttpError ? err.status : 0;
      return {
        authenticated: false,
        redirectTo: "/login",
        error: {
          name: "Unauthenticated",
          message: status === 401 ? "Not authenticated" : "Auth check failed",
        },
      };
    }
  },

  getIdentity: async () => {
    if (cachedUser) return cachedUser;
    try {
      const body = await apiFetch<MeResponse>("/auth/me");
      cachedUser = body.data?.user ?? null;
      cachedMembership = body.data?.membership ?? null;
      cachedCompany = body.data?.company ?? null;
      return cachedUser ?? undefined;
    } catch {
      return undefined;
    }
  },

  onError: async (error) => {
    if (error instanceof HttpError && error.status === 401) {
      cachedUser = null;
      cachedMembership = null;
      cachedCompany = null;
      return { logout: true, redirectTo: "/login" };
    }
    return {};
  },
};

export async function refreshIdentity(): Promise<void> {
  try {
    const body = await apiFetch<MeResponse>("/auth/me");
    cachedUser = body.data?.user ?? null;
    cachedMembership = body.data?.membership ?? null;
    cachedCompany = body.data?.company ?? null;
  } catch {
    cachedUser = null;
    cachedMembership = null;
    cachedCompany = null;
  }
}
