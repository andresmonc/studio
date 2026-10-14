package repository_test

import (
	"context"
	"errors"
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

	// Delete
	require.NoError(t, repo.Delete(ctx, created.ID))
	assert.ErrorIs(t, repo.Delete(ctx, created.ID), repository.ErrNotFound)
}

func TestCompanyRepoMembership(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewCompanyRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	other := testutil.SeedCompany(t, db, "Beta")
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)

	// SetMember attaches a user with no company.
	require.NoError(t, repo.SetMember(ctx, company.ID, user.ID, model.CompanyRoleMember))

	mem, err := repo.Membership(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, mem)
	assert.Equal(t, company.ID, mem.CompanyID)
	assert.Equal(t, model.CompanyRoleMember, mem.Role)

	// SetMember to a different company conflicts (one company per user).
	err = repo.SetMember(ctx, other.ID, user.ID, model.CompanyRoleMember)
	assert.ErrorIs(t, err, repository.ErrConflictOrNotFound)

	// ListMembers
	members, err := repo.ListMembers(ctx, company.ID)
	require.NoError(t, err)
	require.Len(t, members, 1)
	assert.Equal(t, "u@acme.com", members[0].Email)

	// UpdateMemberRole
	require.NoError(t, repo.UpdateMemberRole(ctx, company.ID, user.ID, model.CompanyRoleAdmin))
	mem, _ = repo.Membership(ctx, user.ID)
	assert.Equal(t, model.CompanyRoleAdmin, mem.Role)

	// UpdateMemberRole on a non-member -> ErrNotFound
	stranger := testutil.SeedUser(t, db, "s@x.com", "S", false)
	assert.ErrorIs(t, repo.UpdateMemberRole(ctx, company.ID, stranger.ID, model.CompanyRoleAdmin), repository.ErrNotFound)

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
	require.NoError(t, repo.RemoveMember(ctx, company.ID, user.ID))
	mem, err = repo.Membership(ctx, user.ID)
	require.NoError(t, err)
	assert.Nil(t, mem)
	rows, err := db.Pool.Query(ctx, `SELECT team_id::text FROM team_members WHERE user_id = $1`, user.ID)
	require.NoError(t, err)
	teamIDs, err := pgx.CollectRows(rows, pgx.RowTo[string])
	require.NoError(t, err)
	assert.Equal(t, []string{betaTeam}, teamIDs)
	assert.True(t, errors.Is(repo.RemoveMember(ctx, company.ID, user.ID), repository.ErrNotFound))
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
	assert.ErrorIs(t, repo.SetMember(ctx, id, id, model.CompanyRoleMember), context.Canceled)
	assert.ErrorIs(t, repo.RemoveMember(ctx, id, id), context.Canceled)
	_, err = repo.Membership(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
}
