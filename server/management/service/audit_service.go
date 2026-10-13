package service

import (
	"context"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
)

type AuditService struct {
	repo *repository.AuditRepo
}

func NewAuditService(repo *repository.AuditRepo) *AuditService { return &AuditService{repo: repo} }

func (s *AuditService) List(ctx context.Context, f model.AuditFilters) ([]model.AuditEntry, int, error) {
	return s.repo.List(ctx, f)
}
