package repository_test

import (
	"context"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCompanyRepoCRUD(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewCompanyRepo(db)
	ctx := t.Context()

	// Create
	created, err := repo.Create(ctx, "Acme", "desc")
	require.NoError(t, err)
	assert.NotEmpty(t, created.ID)
	assert.Equal(t, "Acme", created.DisplayName)

	// GetByID
	got, err := repo.GetByID(ctx, created.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, created.ID, got.ID)

	// GetByID missing -> nil, nil
	missing, err := repo.GetByID(ctx, "00000000-0000-0000-0000-000000000000")
	require.NoError(t, err)
	assert.Nil(t, missing)

	// List
	_ = testutil.SeedCompany(t, db, "Beta")
	list, err := repo.List(ctx)
	require.NoError(t, err)
	assert.Len(t, list, 2)
	assert.Equal(t, "Acme", list[0].DisplayName) // ordered by display_name

	// Update display name
	updated, err := repo.Update(ctx, created.ID, new("Acme Inc"), nil)
	require.NoError(t, err)
	assert.Equal(t, "Acme Inc", updated.DisplayName)

	// Update missing -> ErrNotFound
	_, err = repo.Update(ctx, "00000000-0000-0000-0000-000000000000", new("x"), nil)
	assert.ErrorIs(t, err, repository.ErrNotFound)

	// Delete detaches the members first (users.company_id has no ON DELETE).
	member := testutil.SeedUser(t, db, "m@acme.com", "M", false)
	testutil.SetCompanyMember(t, db, created.ID, member.ID, model.CompanyRoleAdmin)
	require.NoError(t, repo.Delete(ctx, created.ID))
	mem, err := repo.Membership(ctx, member.ID)
	require.NoError(t, err)
	assert.Nil(t, mem)
	assert.ErrorIs(t, repo.Delete(ctx, created.ID), repository.ErrNotFound)
	assert.ErrorIs(t, repo.Delete(ctx, "not-a-uuid"), repository.ErrNotFound)
}

func TestCompanyRepoMembership(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewCompanyRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	other := testutil.SeedCompany(t, db, "Beta")
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)

	// SetMember attaches a user with no company and returns the membership.
	m, prev, err := repo.SetMember(ctx, company.ID, user.ID, model.CompanyRoleMember)
	require.NoError(t, err)
	assert.Equal(t, model.CompanyRole(""), prev, "newly added")
	assert.Equal(t, "u@acme.com", m.Email)
	assert.Equal(t, model.CompanyRoleMember, m.Role)
	assert.False(t, m.CreatedAt.IsZero())
	_, prev, err = repo.SetMember(ctx, company.ID, user.ID, model.CompanyRoleMember)
	require.NoError(t, err)
	assert.Equal(t, model.CompanyRoleMember, prev, "already a member")

	mem, err := repo.Membership(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, mem)
	assert.Equal(t, company.ID, mem.CompanyID)
	assert.Equal(t, model.CompanyRoleMember, mem.Role)

	// SetMember to a different company conflicts (one company per user).
	stray := testutil.SeedUser(t, db, "stray@x.com", "S", false)
	_, _, err = repo.SetMember(ctx, "00000000-0000-0000-0000-000000000000", stray.ID, model.CompanyRoleMember)
	assert.ErrorIs(t, err, repository.ErrConflictOrNotFound, "unknown company")
	_, _, err = repo.SetMember(ctx, other.ID, user.ID, model.CompanyRoleMember)
	assert.ErrorIs(t, err, repository.ErrConflictOrNotFound)

	// ListMembers
	members, err := repo.ListMembers(ctx, company.ID)
	require.NoError(t, err)
	require.Len(t, members, 1)
	assert.Equal(t, "u@acme.com", members[0].Email)

	// UpdateMemberRole
	_, prev, err = repo.UpdateMemberRole(ctx, company.ID, user.ID, model.CompanyRoleAdmin)
	require.NoError(t, err)
	assert.Equal(t, model.CompanyRoleMember, prev)
	mem, _ = repo.Membership(ctx, user.ID)
	assert.Equal(t, model.CompanyRoleAdmin, mem.Role)

	// UpdateMemberRole on a non-member -> ErrNotFound
	stranger := testutil.SeedUser(t, db, "s@x.com", "S", false)
	_, _, err = repo.UpdateMemberRole(ctx, company.ID, stranger.ID, model.CompanyRoleAdmin)
	assert.ErrorIs(t, err, repository.ErrNotFound)

	// Team roles: one on the company's team, one on another company's team.
	var acmeTeam, betaTeam string
	require.NoError(t, db.Pool.QueryRow(ctx,
		`INSERT INTO teams (company_id, name) VALUES ($1, 'acme-team') RETURNING id`, company.ID).Scan(&acmeTeam))
	require.NoError(t, db.Pool.QueryRow(ctx,
		`INSERT INTO teams (company_id, name) VALUES ($1, 'beta-team') RETURNING id`, other.ID).Scan(&betaTeam))
	_, err = db.Pool.Exec(ctx,
		`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $3, 'admin'), ($2, $3, 'viewer')`,
		acmeTeam, betaTeam, user.ID)
	require.NoError(t, err)

	// RemoveMember drops the company's team roles only.
	prev, err = repo.RemoveMember(ctx, company.ID, user.ID)
	require.NoError(t, err)
	assert.Equal(t, model.CompanyRoleAdmin, prev)
	mem, err = repo.Membership(ctx, user.ID)
	require.NoError(t, err)
	assert.Nil(t, mem)
	rows, err := db.Pool.Query(ctx, `SELECT team_id::text FROM team_members WHERE user_id = $1`, user.ID)
	require.NoError(t, err)
	teamIDs, err := pgx.CollectRows(rows, pgx.RowTo[string])
	require.NoError(t, err)
	assert.Equal(t, []string{betaTeam}, teamIDs)
	_, err = repo.RemoveMember(ctx, company.ID, user.ID)
	assert.ErrorIs(t, err, repository.ErrNotFound)
}

func TestCompanyRepoFirst(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewCompanyRepo(db)

	none, err := repo.First(t.Context())
	require.NoError(t, err)
	assert.Nil(t, none)

	oldest := testutil.SeedCompany(t, db, "Zeta")
	_ = testutil.SeedCompany(t, db, "Alpha")
	first, err := repo.First(t.Context())
	require.NoError(t, err)
	require.NotNil(t, first)
	assert.Equal(t, oldest.ID, first.ID) // oldest, not alphabetical
}

// A dead context makes every query fail: errors must surface, not be read as
// "not found".
func TestCompanyRepoQueryErrors(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewCompanyRepo(db)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	id := "00000000-0000-0000-0000-000000000000"

	_, err := repo.Create(ctx, "x", "")
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.GetByID(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.First(ctx)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.List(ctx)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.Update(ctx, id, nil, nil)
	assert.ErrorIs(t, err, context.Canceled)
	assert.ErrorIs(t, repo.Delete(ctx, id), context.Canceled)
	_, err = repo.ListMembers(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
	_, _, err = repo.SetMember(ctx, id, id, model.CompanyRoleMember)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.RemoveMember(ctx, id, id)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.Membership(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
}

func TestCompanyRepoCreateWithAdmin(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewCompanyRepo(db)
	ctx := t.Context()
	founder := testutil.SeedUser(t, db, "f@acme.com", "F", false)
	countCompanies := func() int {
		var n int
		require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM companies`).Scan(&n))
		return n
	}

	c, m, err := repo.CreateWithAdmin(ctx, "Acme", "", founder.ID, false)
	require.NoError(t, err)
	assert.Equal(t, c.ID, m.CompanyID)
	assert.Equal(t, model.CompanyRoleAdmin, m.Role)

	tests := []struct {
		name    string
		adminID string
	}{
		{"admin already in a company rolls the company back", founder.ID},
		{"unknown admin rolls the company back", "00000000-0000-0000-0000-000000000000"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, err := repo.CreateWithAdmin(ctx, "Beta", "", tt.adminID, false)
			assert.ErrorIs(t, err, repository.ErrConflictOrNotFound)
			assert.Equal(t, 1, countCompanies(), "no company left behind")
		})
	}

	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	_, _, err = repo.CreateWithAdmin(cancelled, "Gamma", "", founder.ID, false)
	assert.ErrorIs(t, err, context.Canceled)
}

func TestCompanyRepoCreateWithAdminAttachUnassigned(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewCompanyRepo(db)
	ctx := t.Context()
	early := testutil.SeedUser(t, db, "early@acme.com", "E", false)

	c, admin, err := repo.CreateWithAdmin(ctx, "Acme", "", "", true)
	require.NoError(t, err)
	assert.Nil(t, admin, "no admin requested")
	mem, err := repo.Membership(ctx, early.ID)
	require.NoError(t, err)
	require.NotNil(t, mem, "a user who logged in before the company existed joins it")
	assert.Equal(t, c.ID, mem.CompanyID)
	assert.Equal(t, model.CompanyRoleMember, mem.Role)
}
