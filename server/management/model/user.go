package model

import "time"

type User struct {
	ID           string  `db:"id" json:"id"`
	Email        string  `db:"email" json:"email"`
	Name         string  `db:"name" json:"name"`
	AvatarURL    string  `db:"avatar_url" json:"avatar,omitempty"`
	OIDCSub      *string `db:"oidc_sub" json:"-"`
	IsSuperAdmin bool    `db:"is_super_admin" json:"isSuperAdmin"`
	// CompanyID and CompanyRole are both set or both nil; read the role via Role().
	CompanyID   *string      `db:"company_id" json:"companyId,omitempty"`
	CompanyRole *CompanyRole `db:"company_role" json:"companyRole,omitempty"`
	CreatedAt   time.Time    `db:"created_at" json:"createdAt"`
	UpdatedAt   time.Time    `db:"updated_at" json:"updatedAt"`
	LastLoginAt *time.Time   `db:"last_login_at" json:"lastLoginAt,omitempty"`
	// SessionVersion is stamped into session tokens; bumping it revokes them.
	SessionVersion int `db:"session_version" json:"-"`
}

// Role returns the user's company role, or "" (which satisfies no AtLeast check) if unset.
func (u User) Role() CompanyRole {
	if u.CompanyRole == nil {
		return ""
	}
	return *u.CompanyRole
}

type MeResponse struct {
	User       User               `json:"user"`
	Company    *CompanyMembership `json:"company,omitempty"`
	Membership []TeamMembership   `json:"membership"`
}

// NewMeResponse derives Company from the user's own company fields so the role
// in user.companyRole and company.role can never disagree.
func NewMeResponse(u User, companyDisplayName string, teams []TeamMembership) MeResponse {
	if teams == nil {
		teams = []TeamMembership{} // serialize as [] rather than null
	}
	resp := MeResponse{User: u, Membership: teams}
	if u.CompanyID != nil {
		resp.Company = &CompanyMembership{
			CompanyID:          *u.CompanyID,
			CompanyDisplayName: companyDisplayName,
			Role:               u.Role(),
		}
	}
	return resp
}
