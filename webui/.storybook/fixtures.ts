import type {
  AuditEntry,
  Company,
  Flag,
  Flagset,
  MeResponse,
  Team,
  User,
} from "../src/types/api";

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

export const FLAGSETS: Flagset[] = [
  {
    id: "fs-web",
    teamId: "t-core",
    name: "web-storefront",
    description: "Flags served to the public web shop",
    apiKeyCount: 2,
    flagCount: 14,
    enabledFlagCount: 9,
    evaluationContextEnrichment: { env: "production", region: "eu-west-1", tier: 2 },
    defaultTestingEvaluationContext: { targetingKey: "user-42", country: "FR", beta: true },
    ...stamp,
  },
  {
    id: "fs-mobile",
    teamId: "t-core",
    name: "mobile-app",
    description: "iOS and Android clients",
    apiKeyCount: 1,
    flagCount: 6,
    enabledFlagCount: 2,
    ...stamp,
  },
  {
    id: "fs-internal",
    teamId: "t-core",
    name: "internal-tools",
    description: "",
    apiKeyCount: 0,
    flagCount: 0,
    enabledFlagCount: 0,
    ...stamp,
  },
];

export const FLAG: Flag = {
  id: "f-checkout",
  flagsetId: "fs-web",
  name: "checkout-redesign",
  disabled: false,
  currentVersion: 4,
  payload: {
    variations: { enabled: true, disabled: false },
    targeting: [
      { name: "Beta testers", query: 'beta eq true', variation: "enabled" },
      {
        name: "French market",
        query: 'country eq "FR"',
        percentage: { enabled: 30, disabled: 70 },
      },
    ],
    defaultRule: { variation: "disabled" },
    metadata: {
      owner: "ada@acme.dev",
      description: "New one-page checkout flow",
      tags: ["checkout", "q4-launch"],
    },
    trackEvents: true,
  },
  ...stamp,
};

// Newest first, as GET /audit returns them.
const audit = (
  id: number,
  occurredAt: string,
  over: Partial<AuditEntry> & Pick<AuditEntry, "action" | "targetType" | "targetId">,
): AuditEntry => ({
  id,
  occurredAt,
  actorUserId: "u-ada",
  actorEmail: "ada@acme.dev",
  companyId: "acme",
  teamId: "t-core",
  ...over,
});

export const AUDIT_ENTRIES: AuditEntry[] = [
  audit(108, "2026-10-27T14:32:00Z", {
    action: "update",
    targetType: "flag",
    targetId: "f-checkout",
    flagsetId: "fs-web",
    flagId: "f-checkout",
    before: { defaultRule: { variation: "disabled" }, trackEvents: false },
    after: { defaultRule: { variation: "enabled" }, trackEvents: true },
  }),
  audit(107, "2026-10-27T13:05:00Z", {
    action: "update",
    targetType: "flag",
    targetId: "f-search",
    flagsetId: "fs-web",
    flagId: "f-search",
    after: { disabled: true },
  }),
  audit(106, "2026-10-27T11:48:00Z", {
    actorUserId: "u-grace",
    actorEmail: "grace@acme.dev",
    action: "create",
    targetType: "api_key",
    targetId: "k-ci",
    flagsetId: "fs-web",
    after: { label: "ci-relay-proxy", flagsetId: "fs-web" },
  }),
  audit(105, "2026-10-27T09:15:00Z", {
    action: "create",
    targetType: "flag",
    targetId: "f-onboarding",
    flagsetId: "fs-mobile",
    flagId: "f-onboarding",
    after: { variations: { on: true, off: false }, defaultRule: { variation: "off" } },
  }),
  audit(104, "2026-10-26T17:40:00Z", {
    actorUserId: "u-grace",
    actorEmail: "grace@acme.dev",
    action: "create",
    targetType: "team_member",
    targetId: "u-linus",
    after: { userId: "u-linus", role: "editor" },
  }),
  audit(103, "2026-10-26T15:20:00Z", {
    action: "update",
    targetType: "flagset",
    targetId: "fs-web",
    flagsetId: "fs-web",
    before: { description: "" },
    after: { description: "Flags served to the public web shop" },
  }),
  audit(102, "2026-10-26T10:02:00Z", {
    action: "rollback",
    targetType: "flag",
    targetId: "f-pricing",
    flagsetId: "fs-web",
    flagId: "f-pricing",
    before: { defaultRule: { variation: "v3" } },
    after: { defaultRule: { variation: "v2" } },
    metadata: { restoredVersion: 2 },
  }),
  audit(101, "2026-10-26T08:00:00Z", {
    actorUserId: null,
    actorEmail: null,
    action: "delete",
    targetType: "flag",
    targetId: "f-legacy",
    flagsetId: "fs-mobile",
    flagId: "f-legacy",
    before: { variations: { on: true, off: false }, disable: true },
  }),
];
