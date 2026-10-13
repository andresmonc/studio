package model

import "time"

type Role string

const (
	RoleAdmin  Role = "admin"
	RoleEditor Role = "editor"
	RoleViewer Role = "viewer"
)

func (r Role) IsValid() bool {
	switch r {
	case RoleAdmin, RoleEditor, RoleViewer:
		return true
	}
	return false
}

func (r Role) AtLeast(min Role) bool {
	rank := map[Role]int{RoleViewer: 1, RoleEditor: 2, RoleAdmin: 3}
	return rank[r] >= rank[min]
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
	Role  Role   `json:"role" validate:"required" example:"editor"`
}

type UpdateMemberRequest struct {
	Role Role `json:"role" validate:"required" example:"viewer"`
}
