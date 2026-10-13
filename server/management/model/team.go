package model

import "time"

type Role string

const (
	RoleAdmin  Role = "admin"
	RoleEditor Role = "editor"
	RoleViewer Role = "viewer"
)

// roleRank is the single source of truth for valid team roles and their order.
var roleRank = map[Role]int{RoleViewer: 1, RoleEditor: 2, RoleAdmin: 3}

func (r Role) IsValid() bool {
	_, ok := roleRank[r]
	return ok
}

func (r Role) AtLeast(required Role) bool {
	return roleRank[required] > 0 && roleRank[r] >= roleRank[required]
}

type Team struct {
	ID          string    `db:"id" json:"id"`
	CompanyID   string    `db:"company_id" json:"companyId"`
	Name        string    `db:"name" json:"name"`
	Description string    `db:"description" json:"description"`
	CreatedAt   time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt   time.Time `db:"updated_at" json:"updatedAt"`
}

type TeamMember struct {
	ID        string    `db:"id" json:"id"` // = UserID; gives refine a row key
	TeamID    string    `db:"team_id" json:"teamId"`
	UserID    string    `db:"user_id" json:"userId"`
	Email     string    `db:"email" json:"email"`
	Name      string    `db:"name" json:"name"`
	Role      Role      `db:"role" json:"role"`
	CreatedAt time.Time `db:"created_at" json:"createdAt"`
}

type TeamMembership struct {
	TeamID   string `json:"teamId"`
	TeamName string `json:"teamName"`
	Role     Role   `json:"role"`
}

type CreateTeamRequest struct {
	Name        string `json:"name" validate:"required" example:"Payments"`
	Description string `json:"description"`
	AdminEmail  string `json:"adminEmail" validate:"required" example:"jane@acme.com"`
}

type UpdateTeamRequest struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
}

type AddMemberRequest struct {
	Email string `json:"email" validate:"required" example:"jane@acme.com"`
	Role  Role   `json:"role" validate:"required,oneof=admin editor viewer" enums:"admin,editor,viewer" example:"editor"`
}

type UpdateMemberRequest struct {
	Role Role `json:"role" validate:"required,oneof=admin editor viewer" enums:"admin,editor,viewer" example:"viewer"`
}
