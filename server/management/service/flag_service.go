package service

import (
	"bytes"
	"context"
	"encoding/json"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/jackc/pgx/v5"
)

// FlagService writes flags. Unlike the team, company and flagset services,
// every flag write is audited inside its transaction: a flag change without
// its audit entry is rolled back (flags are what operators need to trace).
type FlagService struct {
	db       *repository.DB
	flags    *repository.FlagRepo
	versions *repository.FlagVersionRepo
	flagsets *repository.FlagsetRepo
	audit    *repository.AuditRepo
}

func NewFlagService(
	db *repository.DB, flags *repository.FlagRepo, versions *repository.FlagVersionRepo,
	flagsets *repository.FlagsetRepo, audit *repository.AuditRepo,
) *FlagService {
	return &FlagService{db: db, flags: flags, versions: versions, flagsets: flagsets, audit: audit}
}

// Create creates the flag with its first version, current pointer and tag
// mirror in one transaction, audited in the same transaction. The repository
// locks the live flagset, so a flag can't be created under a flagset being
// deleted (ErrNotFound).
func (s *FlagService) Create(
	ctx context.Context, actorID, flagsetID string, req *model.CreateFlagRequest,
) (*model.Flag, error) {
	payload, errs := preparePayload(req.Payload)
	errs = append(model.ValidateFlagName(req.Name), errs...)
	if err := errs.Err(); err != nil {
		return nil, err
	}
	teamID, err := s.flagsets.TeamID(ctx, flagsetID)
	if err != nil {
		return nil, err
	}

	var out *model.Flag
	err = pgx.BeginFunc(ctx, s.db.Pool, func(tx pgx.Tx) error {
		f, err := s.flags.Create(ctx, tx, flagsetID, req.Name)
		if err != nil {
			return err
		}
		if _, err := saveFlagVersion(ctx, tx, s.flags, s.versions, f, payload, req.Comment, actorID); err != nil {
			return err
		}
		out = f
		return s.audit.Record(ctx, tx, repository.AuditInput{
			ActorUserID: &actorID, TeamID: &teamID, FlagsetID: &flagsetID, FlagID: &f.ID,
			Action: model.AuditActionCreate, TargetType: model.AuditTargetFlag, TargetID: f.ID, After: f,
		})
	})
	if err != nil {
		return nil, writeError(err)
	}
	return out, nil
}

// saveFlagVersion stores payload as f's new current version and mirrors its
// tags, inside tx, and updates f. It is the only path writing versions, so a
// save, a rollback (VersionService) and a create stay consistent.
func saveFlagVersion(
	ctx context.Context, tx pgx.Tx, flags *repository.FlagRepo, versions *repository.FlagVersionRepo,
	f *model.Flag, payload json.RawMessage, comment, actorID string,
) (*model.FlagVersion, error) {
	v, err := versions.Insert(ctx, tx, f.ID, payload, comment, &actorID)
	if err != nil {
		return nil, err
	}
	updatedAt, err := flags.UpdateCurrentVersion(ctx, tx, f.ID, v.ID)
	if err != nil {
		return nil, err
	}
	if err := flags.ReplaceFlagTags(ctx, tx, f.ID, model.FlagTagsFromPayload(payload)); err != nil {
		return nil, err
	}
	f.CurrentVersionID, f.CurrentVersion, f.Payload, f.UpdatedAt = &v.ID, &v.VersionNumber, v.Payload, updatedAt
	return v, nil
}

// preparePayload validates a flag payload and returns the bytes to store: the raw
// bytes as sent (key order preserved), not a re-marshaled DTO, with
// metadata.flagType auto-managed so the exported config carries the flag's
// OpenFeature type, and metadata.tags normalized so the stored config, the
// flag_tags mirror, and the list projection all agree.
//
// It returns every payload and tag problem at once.
func preparePayload(raw json.RawMessage) (json.RawMessage, model.ValidationErrors) {
	invalid := model.ValidationErrors{{Field: "payload", Message: "invalid payload JSON"}}
	dto, err := model.ParseFlagPayload(raw)
	if err != nil {
		return nil, invalid
	}
	if errs := append(model.ValidateFlagPayload(dto), model.ValidateFlagTags(raw)...); len(errs) > 0 {
		return nil, errs
	}
	payload, err := model.SetFlagTypeMetadata(raw)
	if err != nil {
		return nil, invalid
	}
	payload, err = model.NormalizeFlagTags(payload)
	if err != nil {
		return nil, invalid
	}
	return payload, nil
}

func (s *FlagService) Get(ctx context.Context, id string) (*model.Flag, error) {
	return s.flags.GetByID(ctx, id)
}

func (s *FlagService) List(
	ctx context.Context, flagsetID string, f model.FlagFilters,
) ([]model.FlagListItem, int, error) {
	return s.flags.ListByFlagset(ctx, flagsetID, f)
}

// ListByTeam lists one page of a team's flags matching the filters, with the
// total match count.
func (s *FlagService) ListByTeam(
	ctx context.Context, teamID string, filters model.TeamFlagFilters,
) ([]model.FlagInstance, int, error) {
	return s.flags.ListByTeam(ctx, teamID, filters)
}

func (s *FlagService) ListTeamOwners(ctx context.Context, teamID string) ([]model.FlagOwner, error) {
	return s.flags.ListTeamOwners(ctx, teamID)
}

func (s *FlagService) ListTeamTags(ctx context.Context, teamID string) ([]string, error) {
	return s.flags.ListTeamTags(ctx, teamID)
}

// Update saves payload as the flag's new current version. The flag is read
// and locked inside the transaction, so concurrent saves serialize and each
// audit entry's before is the version it actually replaced, and a save racing
// a delete fails with ErrNotFound instead of writing to a deleted flag.
func (s *FlagService) Update(
	ctx context.Context, actorID, id string, req *model.UpdateFlagRequest,
) (*model.Flag, error) {
	payload, errs := preparePayload(req.Payload)
	if err := errs.Err(); err != nil {
		return nil, err
	}
	// The team for the audit entry, read before the transaction so it never
	// waits for a second pool connection while holding one. A flag doesn't
	// move between flagsets.
	current, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	teamID, err := s.flagsets.TeamID(ctx, current.FlagsetID)
	if err != nil {
		return nil, err
	}
	var out *model.Flag
	err = pgx.BeginFunc(ctx, s.db.Pool, func(tx pgx.Tx) error {
		before, err := s.flags.GetForUpdate(ctx, tx, id)
		if err != nil {
			return err
		}
		// A flag's type is immutable after creation (checked against the
		// variations, before any metadata injection).
		if errs := model.ValidateFlagTypeUnchanged(before.Payload, req.Payload); len(errs) > 0 {
			return errs
		}
		// Byte-identical: no new version, no audit entry. Bytes, not values:
		// the stored payload keeps its key order, so a reorder is a change.
		if bytes.Equal(payload, before.Payload) {
			out = before
			return nil
		}
		after := *before
		if _, err := saveFlagVersion(ctx, tx, s.flags, s.versions, &after, payload, req.Comment, actorID); err != nil {
			return err
		}
		out = &after
		return s.audit.Record(ctx, tx, repository.AuditInput{
			ActorUserID: &actorID, TeamID: &teamID, FlagsetID: &before.FlagsetID, FlagID: &id,
			Action: model.AuditActionUpdate, TargetType: model.AuditTargetFlag, TargetID: id,
			Before: before, After: &after,
		})
	})
	if err != nil {
		return nil, writeError(err)
	}
	return out, nil
}

// flagState is the audit payload of an enable/disable.
type flagState struct {
	Disabled bool `json:"disabled"`
}

// SetDisabled turns the flag on or off. Like Update, it reads and locks the
// flag inside the transaction, so the audit entry's before is the state it
// actually changed.
func (s *FlagService) SetDisabled(ctx context.Context, actorID, id string, disabled bool) error {
	return s.lockedWrite(ctx, actorID, id, func(tx pgx.Tx, before *model.Flag) (*repository.AuditInput, error) {
		if before.Disabled == disabled {
			return nil, nil
		}
		if err := s.flags.SetDisabled(ctx, tx, id, disabled); err != nil {
			return nil, err
		}
		return &repository.AuditInput{
			Action: model.AuditActionUpdate, Before: flagState{before.Disabled}, After: flagState{disabled},
		}, nil
	})
}

// Delete soft-deletes the flag and records the state it deleted.
func (s *FlagService) Delete(ctx context.Context, actorID, id string) error {
	return s.lockedWrite(ctx, actorID, id, func(tx pgx.Tx, before *model.Flag) (*repository.AuditInput, error) {
		if err := s.flags.SoftDelete(ctx, tx, id); err != nil {
			return nil, err
		}
		return &repository.AuditInput{Action: model.AuditActionDelete, Before: before}, nil
	})
}

// lockedWrite runs write on the live flag, read and locked inside a
// transaction, and records the audit entry write returns in the same
// transaction (actor, team, flagset, flag and target are filled in). A nil
// entry means write changed nothing, so nothing is audited.
func (s *FlagService) lockedWrite(
	ctx context.Context, actorID, id string, write func(tx pgx.Tx, before *model.Flag) (*repository.AuditInput, error),
) error {
	// The team is read before the transaction, so it never waits for a
	// second pool connection while holding one.
	current, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	teamID, err := s.flagsets.TeamID(ctx, current.FlagsetID)
	if err != nil {
		return err
	}
	err = pgx.BeginFunc(ctx, s.db.Pool, func(tx pgx.Tx) error {
		before, err := s.flags.GetForUpdate(ctx, tx, id)
		if err != nil {
			return err
		}
		in, err := write(tx, before)
		if err != nil || in == nil {
			return err
		}
		in.ActorUserID, in.TeamID, in.FlagsetID, in.FlagID = &actorID, &teamID, &before.FlagsetID, &id
		in.TargetType, in.TargetID = model.AuditTargetFlag, id
		return s.audit.Record(ctx, tx, *in)
	})
	return writeError(err)
}

// TeamID returns the team owning the live flag.
func (s *FlagService) TeamID(ctx context.Context, flagID string) (string, error) {
	return s.flags.TeamID(ctx, flagID)
}

// Evaluate test-evaluates a flag against the supplied evaluation context, running
// the real go-feature-flag evaluation engine. The flag's visibility is enforced
// by the route's RBAC middleware; here we load its current payload and the
// flagset's evaluationContextEnrichment so the result mirrors production.
func (s *FlagService) Evaluate(
	ctx context.Context, flagID string, req *model.EvaluateFlagRequest,
) (*model.EvaluationResult, error) {
	f, err := s.Get(ctx, flagID)
	if err != nil {
		return nil, err
	}
	fs, err := s.flagsets.GetByID(ctx, f.FlagsetID)
	if err != nil {
		return nil, err
	}
	return model.EvaluateFlag(f.Name, f.Payload, fs.EvaluationContextEnrichment, f.Disabled, req)
}
