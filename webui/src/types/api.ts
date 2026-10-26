// Team roles (3). Company roles are a separate, smaller set.
export type Role = "admin" | "editor" | "viewer";
export type CompanyRole = "admin" | "member";

export interface APIResponse<T = unknown> {
  message?: string;
  data?: T;
  errors?: Record<string, string[]>;
  // Present only on paginated list bodies (see PaginatedResponse).
  total?: number;
}

// UIConfig is the public deployment config served by GET /config.
export interface UIConfig {
  monoCompany: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Team {
  id: string;
  companyId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMembership {
  teamId: string;
  teamName: string;
  role: Role;
}

export interface TeamMember {
  id: string; // = userId
  teamId: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

export interface Company {
  id: string;
  displayName: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Flagset {
  id: string;
  teamId: string;
  name: string;
  description: string;
  apiKeyCount: number;
  flagCount: number;
  enabledFlagCount: number;
  evaluationContextEnrichment?: Record<string, unknown> | null;
  defaultTestingEvaluationContext?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFlagsetRequest {
  name: string;
  description?: string;
  evaluationContextEnrichment?: Record<string, unknown> | null;
}

export interface FlagsetAPIKey {
  id: string;
  flagsetId: string;
  label: string;
  apiKey: string;
  createdBy?: string | null;
  createdByName?: string;
  createdAt: string;
}

export interface CreateAPIKeyRequest {
  label: string;
}

// FlagProgressiveRolloutStep mirrors go-feature-flag's progressive rollout step.
export interface FlagProgressiveRolloutStep {
  variation?: string;
  percentage?: number;
  date?: string;
}

// FlagRule mirrors a single targeting rule (or the defaultRule) in the GOFF DTO.
// query is a JSON-logic string for wizard-authored rules. Exactly one of
// variation / percentage / progressiveRollout describes the served outcome.
export interface FlagRule {
  name?: string;
  query?: string;
  variation?: string;
  percentage?: Record<string, number>;
  progressiveRollout?: {
    initial?: FlagProgressiveRolloutStep;
    end?: FlagProgressiveRolloutStep;
  };
  disable?: boolean;
}

// FlagPayload is the go-feature-flag flag definition (coredto.DTO) returned in
// Flag.payload. Variation values are arbitrary JSON (bool/string/number/object).
export interface FlagPayload {
  variations?: Record<string, unknown>;
  targeting?: FlagRule[];
  defaultRule?: FlagRule;
  metadata?: Record<string, unknown>;
  trackEvents?: boolean;
  disable?: boolean;
}

export interface Flag {
  id: string;
  flagsetId: string;
  name: string;
  disabled: boolean;
  currentVersion?: number | null;
  payload?: FlagPayload;
  createdAt: string;
  updatedAt: string;
}

// FlagVersion is one immutable snapshot of a flag's payload (versioning + audit).
export interface FlagVersion {
  id: string;
  flagId: string;
  versionNumber: number;
  payload: FlagPayload;
  comment?: string;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export type FlagType =
  | "boolean"
  | "string"
  | "int"
  | "float"
  | "json"
  | "unknown";

// FlagOwner is an option of the flags list owner filter; the filter takes the id.
export interface FlagOwner {
  id: string;
  name: string;
}

export interface FlagInstance {
  id: string;
  flagsetId: string;
  flagsetName: string;
  name: string;
  type: FlagType;
  disabled: boolean;
  owner?: string | null;
  ownerId?: string;
  currentVersion?: number | null;
  updatedAt: string;
  // Variation names in payload order; drives the distribution bar colors.
  variations?: string[];
  // Default rule's served split (variation name → percent). A single served
  // variation reads as { name: 100 }.
  distribution?: Record<string, number>;
  // Number of targeting rules (0 = serves the default rule only).
  targetingRuleCount?: number;
  // Present only when the default rule is a progressive rollout (renders a
  // rocket + initial→end indicator instead of a distribution bar).
  progressiveRollout?: {
    initialVariation?: string;
    endVariation?: string;
    from: number;
    to: number;
  };
  // User-authored tags (from payload.metadata.tags); rendered as chips and used
  // to filter the list.
  tags?: string[];
}

// AuditEntry mirrors server/management/model/audit.go. Recorded for every
// mutation; listed newest-first by GET /audit (team-scoped via ?teamId=).
// before/after/metadata are arbitrary JSON snapshots (absent on some actions).
export interface AuditEntry {
  id: number;
  occurredAt: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  companyId?: string | null;
  teamId?: string | null;
  flagsetId?: string | null;
  flagId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown> | null;
}

export interface CompanyMembership {
  companyId: string;
  companyDisplayName: string;
  role: CompanyRole;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  isSuperAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface MeResponse {
  user: User;
  company?: CompanyMembership | null;
  membership: TeamMembership[];
}

export interface CreateTeamRequest {
  name: string;
  description?: string;
  adminEmail: string;
}

export interface CreateCompanyRequest {
  displayName: string;
  description?: string;
  adminEmail: string;
}

export interface UpdateCompanyRequest {
  displayName?: string;
  description?: string;
}

export interface CompanyMember {
  id: string; // = userId
  companyId: string;
  userId: string;
  email: string;
  name: string;
  role: CompanyRole;
}

export interface AddCompanyMemberRequest {
  email: string;
  role: CompanyRole;
}

export interface UpdateCompanyMemberRequest {
  role: CompanyRole;
}
