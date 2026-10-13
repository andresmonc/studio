package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAuditAction_IsValid(t *testing.T) {
	for _, a := range []AuditAction{AuditActionCreate, AuditActionUpdate, AuditActionDelete, AuditActionRollback} {
		assert.True(t, a.IsValid(), a)
	}
	for _, a := range []AuditAction{"", "Create", "login"} {
		assert.False(t, a.IsValid(), a)
	}
}

func TestAuditTargetType_IsValid(t *testing.T) {
	for _, tt := range []AuditTargetType{
		AuditTargetCompany, AuditTargetCompanyMember, AuditTargetTeam, AuditTargetTeamMember,
		AuditTargetFlagset, AuditTargetAPIKey, AuditTargetFlag,
	} {
		assert.True(t, tt.IsValid(), tt)
	}
	for _, tt := range []AuditTargetType{"", "Team", "user"} {
		assert.False(t, tt.IsValid(), tt)
	}
}
