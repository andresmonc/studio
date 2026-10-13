package model

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestUser_Role(t *testing.T) {
	assert.Equal(t, CompanyRole(""), User{}.Role())
	admin := CompanyRoleAdmin
	assert.Equal(t, CompanyRoleAdmin, User{CompanyRole: &admin}.Role())
}

func TestNewMeResponse(t *testing.T) {
	t.Run("no company, no teams", func(t *testing.T) {
		b, err := json.Marshal(NewMeResponse(User{ID: "u1"}, "", nil))
		assert.NoError(t, err)
		assert.Contains(t, string(b), `"membership":[]`)
		assert.NotContains(t, string(b), `"company"`)
	})

	t.Run("company role comes from the user", func(t *testing.T) {
		id, role := "c1", CompanyRoleAdmin
		resp := NewMeResponse(User{CompanyID: &id, CompanyRole: &role}, "Acme", nil)
		assert.Equal(t, &CompanyMembership{CompanyID: "c1", CompanyDisplayName: "Acme", Role: CompanyRoleAdmin}, resp.Company)
	})
}
