package model

import "time"

type CompanyRole string

const (
	CompanyRoleAdmin  CompanyRole = "admin"
	CompanyRoleMember CompanyRole = "member"
)

func (r CompanyRole) IsValid() bool {
	switch r {
	case CompanyRoleAdmin, CompanyRoleMember:
		return true
	}
	return false
}

func (r CompanyRole) AtLeast(min CompanyRole) bool {
	rank := map[CompanyRole]int{CompanyRoleMember: 1, CompanyRoleAdmin: 2}
	return rank[r] >= rank[min]
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
	Domain      *string   `db:"domain" json:"domain,omitempty"`
	Description string    `db:"description" json:"description"`
	CreatedAt   time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt   time.Time `db:"updated_at" json:"updatedAt"`
}

type CompanyMember struct {
	ID        string      `json:"id"` // = UserID; gives refine a row key
	CompanyID string      `json:"companyId"`
	UserID    string      `json:"userId"`
	Email     string      `json:"email"`
	Name      string      `json:"name"`
	Role      CompanyRole `json:"role"`
}

type CompanyMembership struct {
	CompanyID          string      `json:"companyId"`
	CompanyDisplayName string      `json:"companyDisplayName"`
	Role               CompanyRole `json:"role"`
}

type CreateCompanyRequest struct {
	DisplayName string  `json:"displayName" validate:"required" example:"Acme Corp"`
	Domain      *string `json:"domain,omitempty" example:"acme.com"`
	Description string  `json:"description"`
}

type UpdateCompanyRequest struct {
	DisplayName *string `json:"displayName,omitempty"`
	Domain      *string `json:"domain,omitempty"`
	Description *string `json:"description,omitempty"`
}

type AddCompanyMemberRequest struct {
	Email string      `json:"email" validate:"required" example:"jane@acme.com"`
	Role  CompanyRole `json:"role" validate:"required" example:"member"`
}

type UpdateCompanyMemberRequest struct {
	Role CompanyRole `json:"role" validate:"required" example:"admin"`
}
