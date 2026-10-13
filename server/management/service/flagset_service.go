package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"

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

// validateFlagset checks the fields shared by create and update. name is nil
// when an update leaves it unchanged; the evaluation-context fields must be a
// JSON object or null when provided.
func validateFlagset(name *string, enrichment, testing json.RawMessage) error {
	if name != nil {
		if err := validateName(name); err != nil {
			return err
		}
	}
	for _, f := range []struct {
		field string
		raw   json.RawMessage
	}{
		{"evaluationContextEnrichment", enrichment},
		{"defaultTestingEvaluationContext", testing},
	} {
		var obj map[string]any
		if len(f.raw) > 0 && json.Unmarshal(f.raw, &obj) != nil {
			return model.ValidationErrors{{Field: f.field, Message: "must be a JSON object or null"}}
		}
	}
	return nil
}

// validateFlagsetConfig checks the relay-proxy settings shared by create and
// update; nil/empty means "not provided".
func validateFlagsetConfig(pollingMs *int, fileFormat *string, retrievers, exporters, notifiers json.RawMessage) error {
	var errs model.ValidationErrors
	if pollingMs != nil && *pollingMs <= 0 {
		errs = append(errs, model.ValidationError{Field: "pollingIntervalMs", Message: "must be greater than 0"})
	}
	if fileFormat != nil {
		switch *fileFormat {
		case "yaml", "json", "toml":
		default:
			errs = append(errs, model.ValidationError{Field: "fileFormat", Message: "must be one of yaml, json, toml"})
		}
	}
	for _, f := range []struct {
		field string
		raw   json.RawMessage
	}{{"retrievers", retrievers}, {"exporters", exporters}, {"notifiers", notifiers}} {
		if len(f.raw) == 0 {
			continue
		}
		var v any
		if json.Unmarshal(f.raw, &v) == nil {
			switch v.(type) {
			case map[string]any, []any, nil:
				continue
			}
		}
		errs = append(errs, model.ValidationError{Field: f.field, Message: "must be a JSON object, array or null"})
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func (s *FlagsetService) Create(ctx context.Context, actorID, teamID string, req *model.CreateFlagsetRequest) (*model.Flagset, error) {
	if err := validateFlagset(&req.Name, req.EvaluationContextEnrichment, req.DefaultTestingEvaluationContext); err != nil {
		return nil, err
	}
	if err := validateFlagsetConfig(req.PollingIntervalMs, req.FileFormat, req.Retrievers, req.Exporters, req.Notifiers); err != nil {
		return nil, err
	}
	fs, err := s.repo.Create(ctx, teamID, req)
	if err != nil {
		return nil, err
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, TeamID: &teamID, FlagsetID: &fs.ID,
		Action: "flagset.create", TargetType: "flagset", TargetID: fs.ID, After: fs,
	})
	// Auto-provision a default API key so the flagset is usable immediately.
	if _, err := s.CreateAPIKey(ctx, actorID, fs.ID, "default"); err != nil {
		return nil, err
	}
	fs.APIKeyCount = 1
	return fs, nil
}

func (s *FlagsetService) Get(ctx context.Context, id string) (*model.Flagset, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *FlagsetService) ListByTeam(ctx context.Context, teamID string) ([]model.Flagset, error) {
	return s.repo.ListByTeam(ctx, teamID)
}

func (s *FlagsetService) Update(ctx context.Context, actorID, id string, req *model.UpdateFlagsetRequest) (*model.Flagset, error) {
	before, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if before == nil {
		return nil, ErrNotFound
	}
	if err := validateFlagset(req.Name, req.EvaluationContextEnrichment, req.DefaultTestingEvaluationContext); err != nil {
		return nil, err
	}
	if err := validateFlagsetConfig(req.PollingIntervalMs, req.FileFormat, req.Retrievers, req.Exporters, req.Notifiers); err != nil {
		return nil, err
	}
	fs, err := s.repo.Update(ctx, id, req)
	if err != nil {
		return nil, err
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, TeamID: &fs.TeamID, FlagsetID: &fs.ID,
		Action: "flagset.update", TargetType: "flagset", TargetID: fs.ID, Before: before, After: fs,
	})
	return fs, nil
}

func (s *FlagsetService) Delete(ctx context.Context, actorID, id string) error {
	before, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if before == nil {
		return ErrNotFound
	}
	if err := s.repo.SoftDelete(ctx, id); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, TeamID: &before.TeamID, FlagsetID: &id,
		Action: "flagset.delete", TargetType: "flagset", TargetID: id, Before: before,
	})
	return nil
}

func (s *FlagsetService) CreateAPIKey(ctx context.Context, actorID, id, label string) (*model.FlagsetAPIKey, error) {
	fs, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if fs == nil {
		return nil, ErrNotFound
	}
	raw, err := randomKey(32)
	if err != nil {
		return nil, err
	}
	key := "goff_" + raw
	k, err := s.repo.InsertAPIKey(ctx, id, label, key, actorID)
	if err != nil {
		return nil, err
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, TeamID: &fs.TeamID, FlagsetID: &id,
		Action: "flagset.apikey.create", TargetType: "flagset", TargetID: id,
		Metadata: map[string]any{"keyId": k.ID, "label": label},
	})
	return k, nil
}

func (s *FlagsetService) ListAPIKeys(ctx context.Context, id string) ([]model.FlagsetAPIKey, error) {
	return s.repo.ListAPIKeys(ctx, id)
}

func (s *FlagsetService) DeleteAPIKey(ctx context.Context, actorID, id, keyID string) error {
	fs, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if fs == nil {
		return ErrNotFound
	}
	// Verify the key actually belongs to this flagset. Without this check an
	// admin of flagset A could revoke a key owned by another tenant's flagset B
	// via DELETE /flagsets/{A}/api-keys/{keyB} (IDOR / cross-tenant DoS), since
	// authorization on the route only covers the path's flagset id.
	owner, err := s.repo.GetAPIKeyFlagset(ctx, keyID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}
	if owner != id {
		return ErrNotFound
	}
	if err := s.repo.DeleteAPIKeyByID(ctx, keyID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, TeamID: &fs.TeamID, FlagsetID: &id,
		Action: "flagset.apikey.delete", TargetType: "flagset", TargetID: id,
		Metadata: map[string]any{"keyId": keyID},
	})
	return nil
}

func randomKey(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
