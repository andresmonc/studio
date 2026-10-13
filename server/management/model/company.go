package model

import "time"

type CompanyRole string

const (
	CompanyRoleAdmin  CompanyRole = "admin"
	CompanyRoleMember CompanyRole = "member"
)

// companyRoleRank is the single source of truth for valid company roles and their order.
var companyRoleRank = map[CompanyRole]int{CompanyRoleMember: 1, CompanyRoleAdmin: 2}

func (r CompanyRole) IsValid() bool {
	_, ok := companyRoleRank[r]
	return ok
}

func (r CompanyRole) AtLeast(required CompanyRole) bool {
	return companyRoleRank[required] > 0 && companyRoleRank[r] >= companyRoleRank[required]
}

// AsTeamRole maps a company role to the equivalent team role for inheritance.
// Only a company admin inherits a team role (admin on every team); a plain
// member inherits nothing and must be explicitly added to a team.
func (r CompanyRole) AsTeamRole() Role {
	switch r {
	case CompanyRoleAdmin:
		return RoleAdmin
	}
	return ""
}

type Company struct {
	ID          string    `db:"id" json:"id"`
	DisplayName string    `db:"display_name" json:"displayName"`
	Description string    `db:"description" json:"description"`
	CreatedAt   time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt   time.Time `db:"updated_at" json:"updatedAt"`
}

type CompanyMember struct {
	ID        string      `db:"id" json:"id"` // = UserID; gives refine a row key
	CompanyID string      `db:"company_id" json:"companyId"`
	UserID    string      `db:"user_id" json:"userId"`
	Email     string      `db:"email" json:"email"`
	Name      string      `db:"name" json:"name"`
	Role      CompanyRole `db:"role" json:"role"`
	CreatedAt time.Time   `db:"created_at" json:"createdAt"`
}

type CompanyMembership struct {
	CompanyID          string      `json:"companyId"`
	CompanyDisplayName string      `json:"companyDisplayName"`
	Role               CompanyRole `json:"role"`
}

type CreateCompanyRequest struct {
	DisplayName string `json:"displayName" validate:"required" example:"Acme Corp"`
	Description string `json:"description"`
}

type UpdateCompanyRequest struct {
	DisplayName *string `json:"displayName,omitempty"`
	Description *string `json:"description,omitempty"`
}

type AddCompanyMemberRequest struct {
	Email string      `json:"email" validate:"required" example:"jane@acme.com"`
	Role  CompanyRole `json:"role" validate:"required,oneof=admin member" enums:"admin,member" example:"member"`
}

type UpdateCompanyMemberRequest struct {
	Role CompanyRole `json:"role" validate:"required,oneof=admin member" enums:"admin,member" example:"admin"`
}
