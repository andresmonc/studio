import type {
  AuditEntry,
  Company,
  CompanyMember,
  Flag,
  Flagset,
  FlagInstance,
  FlagOwner,
  FlagsetAPIKey,
  FlagVersion,
  MeResponse,
  PaginatedResponse,
  Team,
  TeamMember,
  User,
} from "../src/types/api";

// Shared fake data for stories. The preview's data provider serves these by URL
// suffix; stories pick an identity via `parameters: { identity }` and can force
// a request's state via `parameters: { data: { "<suffix>": value | LOADING | FAILED } }`.

// Sentinels for `parameters.data`: a request that never settles, or one that fails.
export const LOADING = Symbol("loading");
export const FAILED = Symbol("failed");

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
  {
    id: "acme",
    displayName: "Acme Corp",
    description: "Makers of fine anvils and rocket skates",
    ...stamp,
  },
  { id: "globex", displayName: "Globex", description: "", ...stamp },
];

export const TEAMS: Team[] = [
  { id: "t-core", companyId: "acme", name: "Core platform", description: "Checkout, search and the storefront backbone", ...stamp },
  { id: "t-growth", companyId: "acme", name: "Growth", description: "Onboarding and pricing experiments", ...stamp },
  { id: "t-mobile", companyId: "acme", name: "Mobile", description: "iOS and Android apps", ...stamp },
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
  viewer: {
    user: user({ id: "u-linus", email: "linus@acme.dev", name: "Linus Torvalds" }),
    company: { companyId: "acme", companyDisplayName: "Acme Corp", role: "member" },
    membership: [{ teamId: "t-core", teamName: "Core platform", role: "viewer" }],
  },
  teamAdmin: {
    user: user({}),
    company: { companyId: "acme", companyDisplayName: "Acme Corp", role: "member" },
    membership: [{ teamId: "t-core", teamName: "Core platform", role: "admin" }],
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

// Hours before now, so the audit log groups events under Today / Yesterday.
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

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
  audit(108, ago(1), {
    action: "update",
    targetType: "flag",
    targetId: "f-checkout",
    flagsetId: "fs-web",
    flagId: "f-checkout",
    before: { defaultRule: { variation: "disabled" }, trackEvents: false },
    after: { defaultRule: { variation: "enabled" }, trackEvents: true },
  }),
  audit(107, ago(2), {
    action: "update",
    targetType: "flag",
    targetId: "f-search",
    flagsetId: "fs-web",
    flagId: "f-search",
    after: { disabled: true },
  }),
  audit(106, ago(4), {
    actorUserId: "u-grace",
    actorEmail: "grace@acme.dev",
    action: "create",
    targetType: "api_key",
    targetId: "k-ci",
    flagsetId: "fs-web",
    after: { label: "ci-relay-proxy", flagsetId: "fs-web" },
  }),
  audit(105, ago(6), {
    action: "create",
    targetType: "flag",
    targetId: "f-onboarding",
    flagsetId: "fs-mobile",
    flagId: "f-onboarding",
    after: { variations: { on: true, off: false }, defaultRule: { variation: "off" } },
  }),
  audit(104, ago(26), {
    actorUserId: "u-grace",
    actorEmail: "grace@acme.dev",
    action: "create",
    targetType: "team_member",
    targetId: "u-linus",
    after: { userId: "u-linus", role: "editor" },
  }),
  audit(103, ago(28), {
    action: "update",
    targetType: "flagset",
    targetId: "fs-web",
    flagsetId: "fs-web",
    before: { description: "" },
    after: { description: "Flags served to the public web shop" },
  }),
  audit(102, ago(33), {
    action: "rollback",
    targetType: "flag",
    targetId: "f-pricing",
    flagsetId: "fs-web",
    flagId: "f-pricing",
    before: { defaultRule: { variation: "v3" } },
    after: { defaultRule: { variation: "v2" } },
    metadata: { restoredVersion: 2 },
  }),
  audit(101, ago(35), {
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

// checkout-redesign's history, oldest first; FLAG is version 4.
const version = (
  versionNumber: number,
  createdAt: string,
  comment: string,
  payload: Flag["payload"],
): FlagVersion => ({
  id: `fv-${versionNumber}`,
  flagId: FLAG.id,
  versionNumber,
  payload: payload!,
  comment,
  createdBy: "u-ada",
  createdByName: "Ada Lovelace",
  createdAt,
});

export const FLAG_VERSIONS: FlagVersion[] = [
  version(1, "2026-10-20T09:00:00Z", "", {
    variations: { enabled: true, disabled: false },
    defaultRule: { variation: "disabled" },
  }),
  version(2, "2026-10-22T10:30:00Z", "feat(flags): beta testers get the new checkout", {
    ...FLAG.payload,
    targeting: FLAG.payload!.targeting!.slice(0, 1),
    metadata: undefined,
    trackEvents: false,
  }),
  version(3, "2026-10-24T16:10:00Z", "feat(flags): open checkout to 30% of FR", {
    ...FLAG.payload,
    trackEvents: false,
  }),
  version(4, "2026-10-27T14:32:00Z", "chore(flags): track evaluation events", FLAG.payload),
];

export const API_KEYS: FlagsetAPIKey[] = [
  {
    id: "k-prod",
    flagsetId: "fs-web",
    label: "production relay proxy",
    apiKey: "goff_live_3f9a1c7e2b8d4a6f9e0c1b2a3d4e5f60",
    createdBy: "u-grace",
    createdByName: "Grace Hopper",
    createdAt: "2026-09-02T08:15:00Z",
  },
  {
    id: "k-ci",
    flagsetId: "fs-web",
    label: "ci-relay-proxy",
    apiKey: "goff_live_8c2e4b6a0d1f3e5c7b9a2d4f6e8c0a1b",
    createdBy: "u-grace",
    createdByName: "Grace Hopper",
    createdAt: "2026-10-27T11:48:00Z",
  },
];

const companyMember = (
  u: Pick<CompanyMember, "userId" | "email" | "name" | "role">,
): CompanyMember => ({ id: u.userId, companyId: "acme", ...u });

export const COMPANY_MEMBERS: CompanyMember[] = [
  companyMember({ userId: "u-grace", email: "grace@acme.dev", name: "Grace Hopper", role: "admin" }),
  companyMember({ userId: "u-ada", email: "ada@acme.dev", name: "Ada Lovelace", role: "member" }),
  companyMember({ userId: "u-linus", email: "linus@acme.dev", name: "Linus Torvalds", role: "member" }),
  companyMember({ userId: "u-margaret", email: "margaret@acme.dev", name: "Margaret Hamilton", role: "member" }),
];

// Members of TEAMS[0] (Core platform).
export const TEAM_MEMBERS: TeamMember[] = [
  { id: "u-ada", teamId: "t-core", userId: "u-ada", email: "ada@acme.dev", name: "Ada Lovelace", role: "editor", createdAt: stamp.createdAt },
  { id: "u-linus", teamId: "t-core", userId: "u-linus", email: "linus@acme.dev", name: "Linus Torvalds", role: "viewer", createdAt: stamp.createdAt },
];

export const paginated = <T,>(data: T[]): PaginatedResponse<T> => ({
  data,
  total: data.length,
  page: 1,
  pageSize: 50,
  totalPages: 1,
});

// Rows of GET /teams/t-core/flags, as the flags list shows them.
const flagRow = (over: Partial<FlagInstance> & Pick<FlagInstance, "id" | "name">): FlagInstance => ({
  flagsetId: "fs-web",
  flagsetName: "web-storefront",
  type: "boolean",
  disabled: false,
  owner: "Ada Lovelace",
  ownerId: "u-ada",
  currentVersion: 1,
  updatedAt: ago(3),
  variations: ["enabled", "disabled"],
  distribution: { disabled: 100 },
  targetingRuleCount: 0,
  ...over,
});

export const FLAG_INSTANCES: FlagInstance[] = [
  flagRow({
    id: FLAG.id,
    name: FLAG.name,
    currentVersion: 4,
    updatedAt: ago(1),
    targetingRuleCount: 2,
    tags: ["checkout", "q4-launch"],
  }),
  flagRow({
    id: "f-search",
    name: "search-v2",
    disabled: true,
    updatedAt: ago(2),
    distribution: { enabled: 100 },
    tags: ["search"],
  }),
  flagRow({
    id: "f-onboarding",
    name: "new-onboarding",
    flagsetId: "fs-mobile",
    flagsetName: "mobile-app",
    owner: "Grace Hopper",
    ownerId: "u-grace",
    variations: ["on", "off"],
    distribution: undefined,
    progressiveRollout: { initialVariation: "off", endVariation: "on", from: 0, to: 100 },
    tags: ["mobile"],
  }),
  flagRow({
    id: "f-pricing",
    name: "pricing-page-v3",
    type: "string",
    updatedAt: ago(33),
    variations: ["v1", "v2", "v3"],
    distribution: { v1: 20, v2: 30, v3: 50 },
    targetingRuleCount: 1,
    tags: ["experiment"],
  }),
  flagRow({
    id: "f-max-items",
    name: "cart-max-items",
    type: "int",
    owner: null,
    ownerId: undefined,
    updatedAt: ago(200),
    variations: ["low", "high"],
    distribution: { high: 100 },
  }),
];

export const FLAG_OWNERS: FlagOwner[] = [
  { id: "u-ada", name: "Ada Lovelace" },
  { id: "u-grace", name: "Grace Hopper" },
];

export const TAGS = ["checkout", "experiment", "mobile", "q4-launch", "search"];
