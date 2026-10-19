package service

import (
	"bytes"
	"context"
	"strconv"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/jackc/pgx/v5"
)

type VersionService struct {
	db       *repository.DB
	flags    *repository.FlagRepo
	versions *repository.FlagVersionRepo
	flagsets *repository.FlagsetRepo
	audit    *repository.AuditRepo
}

func NewVersionService(
	db *repository.DB, flags *repository.FlagRepo, versions *repository.FlagVersionRepo,
	flagsets *repository.FlagsetRepo, audit *repository.AuditRepo,
) *VersionService {
	return &VersionService{db: db, flags: flags, versions: versions, flagsets: flagsets, audit: audit}
}

// List returns one page of the flag's versions, newest first, and their total.
// A missing or deleted flag is ErrNotFound rather than an empty history.
func (s *VersionService) List(
	ctx context.Context, flagID string, page, pageSize int,
) ([]model.FlagVersion, int, error) {
	if _, err := s.liveFlag(ctx, flagID); err != nil {
		return nil, 0, err
	}
	page, pageSize = model.ClampPage(page, pageSize)
	return s.versions.ListByFlag(ctx, flagID, pageSize, (page-1)*pageSize)
}

func (s *VersionService) Get(ctx context.Context, flagID string, num int) (*model.FlagVersion, error) {
	return s.versions.GetByFlagAndNumber(ctx, flagID, num)
}

// Rollback saves version num's payload as the flag's new current version,
// audited in the same transaction like any flag save. created is false when
// the flag already serves that payload: the current version is returned and
// nothing is written. The flag is read and
// locked inside the transaction, so a rollback racing a delete returns
// ErrNotFound and one racing a save records the version it replaced.
func (s *VersionService) Rollback(
	ctx context.Context, actorID, flagID string, num int, comment string,
) (v *model.FlagVersion, created bool, err error) {
	src, err := s.Get(ctx, flagID, num)
	if err != nil {
		return nil, false, err
	}
	// The team is read before the transaction, so it never waits for a
	// second pool connection while holding one.
	current, err := s.liveFlag(ctx, flagID)
	if err != nil {
		return nil, false, err
	}
	teamID, err := s.flagsets.TeamID(ctx, current.FlagsetID)
	if err != nil {
		return nil, false, err
	}
	if comment == "" {
		comment = "rollback to version " + strconv.Itoa(num)
	}

	var out *model.FlagVersion
	currentNum := 0 // set when the flag already serves src's payload
	err = pgx.BeginFunc(ctx, s.db.Pool, func(tx pgx.Tx) error {
		before, err := s.flags.GetForUpdate(ctx, tx, flagID)
		if err != nil {
			return err
		}
		// Rolling back to the payload already served (e.g. the current
		// version) saves no identical version and no audit entry.
		if before.CurrentVersion != nil && bytes.Equal(src.Payload, before.Payload) {
			currentNum = *before.CurrentVersion
			return nil
		}
		after := *before
		v, err := saveFlagVersion(ctx, tx, s.flags, s.versions, &after, src.Payload, comment, actorID)
		if err != nil {
			return err
		}
		out = v
		return s.audit.Record(ctx, tx, repository.AuditInput{
			ActorUserID: &actorID, TeamID: &teamID, FlagsetID: &before.FlagsetID, FlagID: &flagID,
			Action: model.AuditActionRollback, TargetType: model.AuditTargetFlag, TargetID: flagID,
			Before: before, After: &after, Metadata: map[string]int{"restoredVersion": num},
		})
	})
	if err != nil {
		return nil, false, writeError(err)
	}
	if currentNum != 0 {
		v, err := s.Get(ctx, flagID, currentNum)
		return v, false, err
	}
	return out, true, nil
}

// liveFlag returns the flag, or ErrNotFound when it is missing or deleted.
func (s *VersionService) liveFlag(ctx context.Context, id string) (*model.Flag, error) {
	return s.flags.GetByID(ctx, id)
}
