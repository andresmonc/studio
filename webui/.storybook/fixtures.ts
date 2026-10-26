import type { Company, MeResponse, Team, User } from "../src/types/api";

// Shared fake data for stories. The preview's data provider serves COMPANIES
// and TEAMS; stories pick an identity via `parameters: { identity }`.

const user = (over: Partial<User>): User => ({
  id: "u-ada",
  email: "ada@acme.dev",
  name: "Ada Lovelace",
  isSuperAdmin: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

const stamp = { createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };

export const COMPANIES: Company[] = [
  { id: "acme", displayName: "Acme Corp", description: "", ...stamp },
  { id: "globex", displayName: "Globex", description: "", ...stamp },
];

export const TEAMS: Team[] = [
  { id: "t-core", companyId: "acme", name: "Core platform", description: "", ...stamp },
  { id: "t-growth", companyId: "acme", name: "Growth", description: "", ...stamp },
  { id: "t-mobile", companyId: "acme", name: "Mobile", description: "", ...stamp },
];

export const IDENTITIES = {
  member: {
    user: user({}),
    company: { companyId: "acme", companyDisplayName: "Acme Corp", role: "member" },
    membership: [
      { teamId: "t-core", teamName: "Core platform", role: "editor" },
      { teamId: "t-growth", teamName: "Growth", role: "viewer" },
    ],
  },
  singleTeamMember: {
    user: user({}),
    company: { companyId: "acme", companyDisplayName: "Acme Corp", role: "member" },
    membership: [{ teamId: "t-core", teamName: "Core platform", role: "editor" }],
  },
  companyAdmin: {
    user: user({ id: "u-grace", email: "grace@acme.dev", name: "Grace Hopper" }),
    company: { companyId: "acme", companyDisplayName: "Acme Corp", role: "admin" },
    membership: [],
  },
  superAdmin: {
    user: user({
      id: "u-linus",
      email: "linus@acme.dev",
      name: "Linus Torvalds",
      isSuperAdmin: true,
    }),
    company: null,
    membership: [],
  },
} satisfies Record<string, MeResponse>;
