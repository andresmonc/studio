package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCompanyRole_IsValid(t *testing.T) {
	tests := []struct {
		name string
		role CompanyRole
		want bool
	}{
		{"admin", CompanyRoleAdmin, true},
		{"member", CompanyRoleMember, true},
		{"editor is not a company role", CompanyRole("editor"), false},
		{"viewer is not a company role", CompanyRole("viewer"), false},
		{"empty", CompanyRole(""), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.role.IsValid())
		})
	}
}

func TestCompanyRole_AtLeast(t *testing.T) {
	tests := []struct {
		name string
		have CompanyRole
		min  CompanyRole
		want bool
	}{
		{"admin >= member", CompanyRoleAdmin, CompanyRoleMember, true},
		{"admin >= admin", CompanyRoleAdmin, CompanyRoleAdmin, true},
		{"member >= member", CompanyRoleMember, CompanyRoleMember, true},
		{"member < admin", CompanyRoleMember, CompanyRoleAdmin, false},
		{"empty < member", CompanyRole(""), CompanyRoleMember, false},
		{"admin vs unknown", CompanyRoleAdmin, CompanyRole("owner"), false},
		{"empty vs empty", CompanyRole(""), CompanyRole(""), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.have.AtLeast(tt.min))
		})
	}
}

func TestCompanyRole_AsTeamRole(t *testing.T) {
	// Only a company admin inherits a team role; a member inherits nothing.
	tests := []struct {
		name string
		role CompanyRole
		want Role
	}{
		{"admin inherits team admin", CompanyRoleAdmin, RoleAdmin},
		{"member inherits nothing", CompanyRoleMember, Role("")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.role.AsTeamRole())
		})
	}
}
