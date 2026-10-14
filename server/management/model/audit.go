package model

import (
	"encoding/json"
	"time"
)

type AuditAction string

const (
	AuditActionCreate   AuditAction = "create"
	AuditActionUpdate   AuditAction = "update"
	AuditActionDelete   AuditAction = "delete"
	AuditActionRollback AuditAction = "rollback"
)

// auditActions is the single source of truth for valid audit actions.
var auditActions = map[AuditAction]struct{}{
	AuditActionCreate: {}, AuditActionUpdate: {}, AuditActionDelete: {}, AuditActionRollback: {},
}

func (a AuditAction) IsValid() bool {
	_, ok := auditActions[a]
	return ok
}

type AuditTargetType string

const (
	AuditTargetCompany       AuditTargetType = "company"
	AuditTargetCompanyMember AuditTargetType = "company_member"
	AuditTargetTeam          AuditTargetType = "team"
	AuditTargetTeamMember    AuditTargetType = "team_member"
	AuditTargetFlagset       AuditTargetType = "flagset"
	AuditTargetAPIKey        AuditTargetType = "api_key"
	AuditTargetFlag          AuditTargetType = "flag"
)

// auditTargetTypes is the single source of truth for valid audit target types.
var auditTargetTypes = map[AuditTargetType]struct{}{
	AuditTargetCompany: {}, AuditTargetCompanyMember: {}, AuditTargetTeam: {}, AuditTargetTeamMember: {},
	AuditTargetFlagset: {}, AuditTargetAPIKey: {}, AuditTargetFlag: {},
}

func (t AuditTargetType) IsValid() bool {
	_, ok := auditTargetTypes[t]
	return ok
}

type AuditEntry struct {
	// ID is a bigserial rather than a UUID: audit rows are append-only and
	// ordering by ID matches insertion order.
	ID          int64           `db:"id" json:"id"`
	OccurredAt  time.Time       `db:"occurred_at" json:"occurredAt"`
	ActorUserID *string         `db:"actor_user_id" json:"actorUserId,omitempty"`
	ActorEmail  *string         `db:"actor_email" json:"actorEmail,omitempty"`
	CompanyID   *string         `db:"company_id" json:"companyId,omitempty"`
	TeamID      *string         `db:"team_id" json:"teamId,omitempty"`
	FlagsetID   *string         `db:"flagset_id" json:"flagsetId,omitempty"`
	FlagID      *string         `db:"flag_id" json:"flagId,omitempty"`
	Action      AuditAction     `db:"action" json:"action"`
	TargetType  AuditTargetType `db:"target_type" json:"targetType"`
	TargetID    string          `db:"target_id" json:"targetId"`
	Before      json.RawMessage `db:"before" json:"before,omitempty" swaggertype:"object"`
	After       json.RawMessage `db:"after" json:"after,omitempty" swaggertype:"object"`
	Metadata    json.RawMessage `db:"metadata" json:"metadata,omitempty" swaggertype:"object"`
}

// AuditScope restricts audit queries to what the caller may see. It is derived
// server-side from the authenticated user and must never be bound from client
// input; keeping it out of AuditFilters makes that mix-up impossible.
type AuditScope struct {
	// CompanyID, when set, restricts results to entries whose company_id is
	// that company. Set for non-super-admins.
	CompanyID *string
	// MemberUserID, when set, further restricts results to the teams that user
	// is an explicit member of, plus company-level events. Set for company
	// members who are not company admins.
	MemberUserID *string
}

// AuditFilters holds the client-supplied filters of an audit query.
type AuditFilters struct {
	CompanyID   *string
	TeamID      *string
	FlagsetID   *string
	FlagID      *string
	ActorUserID *string
	Action      *AuditAction
	From        *time.Time
	To          *time.Time
	Page        int
	PageSize    int
}
