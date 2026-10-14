package testutil

import (
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
)

// SeedCompany inserts a company and returns it.
func SeedCompany(t *testing.T, db *repository.DB, displayName string) *model.Company {
	t.Helper()
	c, err := repository.NewCompanyRepo(db).Create(t.Context(), displayName, "")
	if err != nil {
		t.Fatalf("seed company: %v", err)
	}
	return c
}

// SeedUser inserts a user (via the OIDC upsert path, using the email as the
// oidc subject) and returns it.
func SeedUser(t *testing.T, db *repository.DB, email, name string, superAdmin bool) *model.User {
	t.Helper()
	u, err := repository.NewUserRepo(db).UpsertFromOIDC(t.Context(), email, name, "", email, superAdmin)
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	return u
}
