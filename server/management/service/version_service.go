package service

import (
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

func NewVersionService(db *repository.DB, flags *repository.FlagRepo, versions *repository.FlagVersionRepo, flagsets *repository.FlagsetRepo, audit *repository.AuditRepo) *VersionService {
	return &VersionService{db: db, flags: flags, versions: versions, flagsets: flagsets, audit: audit}
}

func (s *VersionService) List(ctx context.Context, flagID string, page, pageSize int) ([]model.FlagVersion, int, error) {
	page, pageSize = model.ClampPage(page, pageSize)
	return s.versions.ListByFlag(ctx, flagID, pageSize, (page-1)*pageSize)
}

func (s *VersionService) Get(ctx context.Context, flagID string, num int) (*model.FlagVersion, error) {
	return s.versions.GetByFlagAndNumber(ctx, flagID, num)
}

func (s *VersionService) Rollback(ctx context.Context, actorID, flagID string, num int, comment string) (*model.FlagVersion, error) {
	src, err := s.versions.GetByFlagAndNumber(ctx, flagID, num)
	if err != nil {
		return nil, err
	}
	if src == nil {
		return nil, ErrNotFound
	}
	flag, err := s.flags.GetByID(ctx, flagID)
	if err != nil {
		return nil, err
	}
	if flag == nil {
		return nil, ErrNotFound
	}
	teamID := teamIDOf(ctx, s.flagsets, flag.FlagsetID)
	if comment == "" {
		comment = "rollback to version " + strconv.Itoa(num)
	}

	var out *model.FlagVersion
	err = pgx.BeginFunc(ctx, s.db.Pool, func(tx pgx.Tx) error {
		v, err := s.versions.Insert(ctx, tx, flagID, src.Payload, comment, &actorID)
		if err != nil {
			return err
		}
		if err := s.flags.UpdateCurrentVersion(ctx, tx, flagID, v.ID); err != nil {
			return err
		}
		if err := s.flags.ReplaceFlagTags(ctx, tx, flagID, model.FlagTagsFromPayload(src.Payload)); err != nil {
			return err
		}
		out = v
		return s.audit.Record(ctx, tx, repository.AuditInput{
			ActorUserID: &actorID, TeamID: teamID, FlagsetID: &flag.FlagsetID, FlagID: &flagID,
			Action: "flag.rollback", TargetType: "flag", TargetID: flagID,
			Metadata: map[string]any{"fromVersion": num, "toVersion": v.VersionNumber},
		})
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}
