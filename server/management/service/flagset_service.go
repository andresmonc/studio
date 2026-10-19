package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
)

type FlagsetService struct {
	repo  *repository.FlagsetRepo
	audit *repository.AuditRepo
}

func NewFlagsetService(repo *repository.FlagsetRepo, audit *repository.AuditRepo) *FlagsetService {
	return &FlagsetService{repo: repo, audit: audit}
}

// flagsetSettings are the fields shared by create and update; nil/empty means
// "not provided".
type flagsetSettings struct {
	name                                    *string
	enrichment, defaultTestingEvaluationCtx json.RawMessage
}

// validate returns every problem at once. The evaluation-context fields must be
// a JSON object or null.
func (f flagsetSettings) validate() error {
	var errs model.ValidationErrors
	if f.name != nil {
		errs = append(errs, validateName(f.name, "name")...)
	}
	for _, c := range []struct {
		field string
		raw   json.RawMessage
	}{
		{"evaluationContextEnrichment", f.enrichment},
		{"defaultTestingEvaluationContext", f.defaultTestingEvaluationCtx},
	} {
		if len(c.raw) == 0 {
			continue
		}
		var v any
		if json.Unmarshal(c.raw, &v) != nil || !isObjectOrNull(v) {
			errs = append(errs, model.ValidationError{Field: c.field, Message: c.field + " must be a JSON object or null"})
		}
	}
	return errs.Err()
}

func isObjectOrNull(v any) bool {
	switch v.(type) {
	case map[string]any, nil:
		return true
	}
	return false
}

// Create creates the flagset with a "default" API key, so it is usable
// immediately; both are written in one transaction.
func (s *FlagsetService) Create(
	ctx context.Context, actorID, teamID string, req *model.CreateFlagsetRequest,
) (*model.Flagset, error) {
	err := flagsetSettings{
		name:       &req.Name,
		enrichment: req.EvaluationContextEnrichment, defaultTestingEvaluationCtx: req.DefaultTestingEvaluationContext,
	}.validate()
	if err != nil {
		return nil, err
	}
	key, err := newAPIKey()
	if err != nil {
		return nil, err
	}
	fs, k, err := s.repo.CreateWithAPIKey(ctx, teamID, req, "default", key, actorID)
	if err != nil {
		return nil, writeError(err)
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, TeamID: &teamID, FlagsetID: &fs.ID,
		Action: model.AuditActionCreate, TargetType: model.AuditTargetFlagset, TargetID: fs.ID, After: fs,
	})
	s.auditAPIKey(ctx, actorID, fs, model.AuditActionCreate, k.ID, k.Label)
	return fs, nil
}

func (s *FlagsetService) Get(ctx context.Context, id string) (*model.Flagset, error) {
	return s.repo.GetByID(ctx, id)
}

// TeamID returns the team owning the live flagset.
func (s *FlagsetService) TeamID(ctx context.Context, id string) (string, error) {
	return s.repo.TeamID(ctx, id)
}

func (s *FlagsetService) ListByTeam(ctx context.Context, teamID string) ([]model.Flagset, error) {
	return s.repo.ListByTeam(ctx, teamID)
}

func (s *FlagsetService) Update(
	ctx context.Context, actorID, id string, req *model.UpdateFlagsetRequest,
) (*model.Flagset, error) {
	err := flagsetSettings{
		name:       req.Name,
		enrichment: req.EvaluationContextEnrichment, defaultTestingEvaluationCtx: req.DefaultTestingEvaluationContext,
	}.validate()
	if err != nil {
		return nil, err
	}
	before, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if !changes(req.Name, before.Name) && !changes(req.Description, before.Description) &&
		!jsonChanges(req.EvaluationContextEnrichment, before.EvaluationContextEnrichment) &&
		!jsonChanges(req.DefaultTestingEvaluationContext, before.DefaultTestingEvaluationContext) {
		return before, nil
	}
	fs, err := s.repo.Update(ctx, id, req)
	if err != nil {
		return nil, writeError(err)
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, TeamID: &fs.TeamID, FlagsetID: &fs.ID,
		Action: model.AuditActionUpdate, TargetType: model.AuditTargetFlagset, TargetID: fs.ID,
		Before: before, After: fs,
	})
	return fs, nil
}

func (s *FlagsetService) Delete(ctx context.Context, actorID, id string) error {
	before, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	if err := s.repo.SoftDelete(ctx, id); err != nil {
		return writeError(err)
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, TeamID: &before.TeamID, FlagsetID: &id,
		Action: model.AuditActionDelete, TargetType: model.AuditTargetFlagset, TargetID: id, Before: before,
	})
	return nil
}

// CreateAPIKey adds a key to the flagset. The repository refuses a deleted
// flagset, including one deleted concurrently, with ErrNotFound.
func (s *FlagsetService) CreateAPIKey(ctx context.Context, actorID, id, label string) (*model.FlagsetAPIKey, error) {
	if err := validateName(&label, "label"); err != nil {
		return nil, err
	}
	fs, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	key, err := newAPIKey()
	if err != nil {
		return nil, err
	}
	k, err := s.repo.InsertAPIKey(ctx, id, label, key, actorID)
	if err != nil {
		return nil, writeError(err)
	}
	s.auditAPIKey(ctx, actorID, fs, model.AuditActionCreate, k.ID, label)
	return k, nil
}

func (s *FlagsetService) ListAPIKeys(ctx context.Context, id string) ([]model.FlagsetAPIKey, error) {
	if _, err := s.Get(ctx, id); err != nil {
		return nil, err
	}
	return s.repo.ListAPIKeys(ctx, id)
}

// DeleteAPIKey revokes a key of the flagset. The repository scopes the delete
// to the flagset, so a key of another tenant's flagset is not found.
func (s *FlagsetService) DeleteAPIKey(ctx context.Context, actorID, id, keyID string) error {
	fs, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	k, err := s.repo.DeleteAPIKey(ctx, id, keyID)
	if err != nil {
		return writeError(err)
	}
	s.auditAPIKey(ctx, actorID, fs, model.AuditActionDelete, keyID, k.Label)
	return nil
}

// auditAPIKey records a key event with its label (after a create, before a
// delete); the key itself is a secret and never logged.
func (s *FlagsetService) auditAPIKey(
	ctx context.Context, actorID string, fs *model.Flagset, action model.AuditAction, keyID, label string,
) {
	in := repository.AuditInput{
		ActorUserID: &actorID, TeamID: &fs.TeamID, FlagsetID: &fs.ID,
		Action: action, TargetType: model.AuditTargetAPIKey, TargetID: keyID,
	}
	snapshot := map[string]string{"label": label}
	if action == model.AuditActionDelete {
		in.Before = snapshot
	} else {
		in.After = snapshot
	}
	_ = s.audit.Record(ctx, nil, in)
}

// newAPIKey returns a relay-proxy API key: "goff_" and 32 random bytes in hex.
func newAPIKey() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "goff_" + hex.EncodeToString(b), nil
}
