package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAuditAction_IsValid(t *testing.T) {
	tests := []struct {
		name   string
		action AuditAction
		want   bool
	}{
		{"create", AuditActionCreate, true},
		{"update", AuditActionUpdate, true},
		{"delete", AuditActionDelete, true},
		{"rollback", AuditActionRollback, true},
		{"empty", AuditAction(""), false},
		{"wrong case", AuditAction("Create"), false},
		{"unknown", AuditAction("login"), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.action.IsValid())
		})
	}
}

func TestAuditTargetType_IsValid(t *testing.T) {
	tests := []struct {
		name   string
		target AuditTargetType
		want   bool
	}{
		{"company", AuditTargetCompany, true},
		{"company member", AuditTargetCompanyMember, true},
		{"team", AuditTargetTeam, true},
		{"team member", AuditTargetTeamMember, true},
		{"flagset", AuditTargetFlagset, true},
		{"api key", AuditTargetAPIKey, true},
		{"flag", AuditTargetFlag, true},
		{"empty", AuditTargetType(""), false},
		{"wrong case", AuditTargetType("Team"), false},
		{"unknown", AuditTargetType("user"), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.target.IsValid())
		})
	}
}
