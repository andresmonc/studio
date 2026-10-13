package model

import (
	"encoding/json"
	"time"
)

type AuditEntry struct {
	ID          int64           `db:"id" json:"id"`
	OccurredAt  time.Time       `db:"occurred_at" json:"occurredAt"`
	ActorUserID *string         `db:"actor_user_id" json:"actorUserId,omitempty"`
	ActorEmail  *string         `db:"actor_email" json:"actorEmail,omitempty"`
	CompanyID   *string         `db:"company_id" json:"companyId,omitempty"`
	TeamID      *string         `db:"team_id" json:"teamId,omitempty"`
	FlagsetID   *string         `db:"flagset_id" json:"flagsetId,omitempty"`
	FlagID      *string         `db:"flag_id" json:"flagId,omitempty"`
	Action      string          `db:"action" json:"action"`
	TargetType  string          `db:"target_type" json:"targetType"`
	TargetID    string          `db:"target_id" json:"targetId"`
	Before      json.RawMessage `db:"before" json:"before,omitempty" swaggertype:"object"`
	After       json.RawMessage `db:"after" json:"after,omitempty" swaggertype:"object"`
	Metadata    json.RawMessage `db:"metadata" json:"metadata,omitempty" swaggertype:"object"`
}

type AuditFilters struct {
	// ScopeCompanyID, when set, restricts results to entries belonging to that
	// company (directly via company_id, or indirectly via a team owned by the
	// company). It is enforced server-side for non-super-admins and must never
	// be derived from client input.
	ScopeCompanyID *string
	// ScopeMemberUserID, when set, further restricts results to the teams that
	// user is an explicit member of, plus company-level events. It is enforced
	// server-side for company members who are not company admins and must
	// never be derived from client input.
	ScopeMemberUserID *string
	CompanyID         *string
	TeamID            *string
	FlagsetID         *string
	FlagID            *string
	ActorID           *string
	Action            *string
	From              *time.Time
	To                *time.Time
	Page              int
	PageSize          int
}
