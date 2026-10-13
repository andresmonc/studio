package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestUser_Role(t *testing.T) {
	admin := CompanyRoleAdmin
	tests := []struct {
		name string
		user User
		want CompanyRole
	}{
		{"no company role", User{}, CompanyRole("")},
		{"company role set", User{CompanyRole: &admin}, CompanyRoleAdmin},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.user.Role())
		})
	}
}

func TestNewMeResponse(t *testing.T) {
	companyID, admin := "c1", CompanyRoleAdmin
	tests := []struct {
		name               string
		user               User
		companyDisplayName string
		teams              []TeamMembership
		wantCompany        *CompanyMembership
		wantMembership     []TeamMembership
	}{
		{
			// Nil teams become a non-nil slice so they serialize as [] not null.
			name:           "no company, no teams",
			user:           User{ID: "u1"},
			wantMembership: []TeamMembership{},
		},
		{
			name:               "company role comes from the user",
			user:               User{CompanyID: &companyID, CompanyRole: &admin},
			companyDisplayName: "Acme",
			wantCompany:        &CompanyMembership{CompanyID: "c1", CompanyDisplayName: "Acme", Role: CompanyRoleAdmin},
			wantMembership:     []TeamMembership{},
		},
		{
			name:           "teams are passed through",
			user:           User{ID: "u1"},
			teams:          []TeamMembership{{TeamID: "t1", Role: RoleEditor}},
			wantMembership: []TeamMembership{{TeamID: "t1", Role: RoleEditor}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := NewMeResponse(tt.user, tt.companyDisplayName, tt.teams)
			assert.Equal(t, tt.user, resp.User)
			assert.Equal(t, tt.wantCompany, resp.Company)
			assert.Equal(t, tt.wantMembership, resp.Membership)
		})
	}
}
