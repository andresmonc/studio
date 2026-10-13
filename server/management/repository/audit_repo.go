package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/jackc/pgx/v5"
)

type AuditRepo struct{ db *DB }

func NewAuditRepo(db *DB) *AuditRepo { return &AuditRepo{db: db} }

type AuditInput struct {
	ActorUserID *string
	CompanyID   *string
	TeamID      *string
	FlagsetID   *string
	FlagID      *string
	Action      string
	TargetType  string
	TargetID    string
	Before      any
	After       any
	Metadata    any
}

func (r *AuditRepo) Record(ctx context.Context, tx pgx.Tx, in AuditInput) error {
	before := marshalAny(in.Before)
	after := marshalAny(in.After)
	meta := marshalAny(in.Metadata)

	// company_id falls back to the team's company so flag/flagset events (which
	// only pass TeamID) stay tenant-scoped after the team is deleted.
	q := `INSERT INTO audit_log (actor_user_id, company_id, team_id, flagset_id, flag_id, action, target_type, target_id, before, after, metadata)
	      VALUES ($1, COALESCE($2::uuid, (SELECT company_id FROM teams WHERE id = $3::uuid)), $3,$4,$5,$6,$7,$8,$9,$10,$11)`
	args := []any{in.ActorUserID, in.CompanyID, in.TeamID, in.FlagsetID, in.FlagID, in.Action, in.TargetType, in.TargetID, before, after, meta}
	var err error
	if tx != nil {
		_, err = tx.Exec(ctx, q, args...)
	} else {
		_, err = r.db.Pool.Exec(ctx, q, args...)
	}
	// Most callers treat audit as best-effort and drop the error, so log it here
	// to keep a broken audit pipeline visible.
	if err != nil {
		slog.ErrorContext(ctx, "audit write failed", "action", in.Action, "target_type", in.TargetType, "target_id", in.TargetID, "error", err)
	}
	return err
}

func marshalAny(v any) any {
	if v == nil {
		return nil
	}
	if raw, ok := v.(json.RawMessage); ok {
		if len(raw) == 0 {
			return nil
		}
		return []byte(raw)
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	return b
}

func (r *AuditRepo) List(ctx context.Context, f model.AuditFilters) ([]model.AuditEntry, int, error) {
	qb := NewQueryBuilder()
	if f.ScopeCompanyID != nil {
		// Tenant isolation: an entry belongs to a company when its company_id
		// matches, or when it targets a team owned by that company (flag/flagset
		// events only carry team_id, not company_id). The single bound argument
		// is referenced twice via an explicit index.
		qb.Add("(a.company_id = $%[1]d OR a.team_id IN (SELECT id FROM teams WHERE company_id = $%[1]d))", *f.ScopeCompanyID)
	}
	if f.ScopeMemberUserID != nil {
		// Team events only for the user's teams; company-level events carry no
		// team_id. Matching a bare team_id IS NULL would also expose deleted
		// teams' history, whose team_id is nulled by ON DELETE SET NULL.
		qb.Add("(a.team_id IN (SELECT team_id FROM team_members WHERE user_id = $%d) OR (a.team_id IS NULL AND a.action LIKE 'company.%%'))", *f.ScopeMemberUserID)
	}
	if f.CompanyID != nil {
		qb.Add("a.company_id = $%d", *f.CompanyID)
	}
	if f.TeamID != nil {
		qb.Add("a.team_id = $%d", *f.TeamID)
	}
	if f.FlagsetID != nil {
		qb.Add("a.flagset_id = $%d", *f.FlagsetID)
	}
	if f.FlagID != nil {
		qb.Add("a.flag_id = $%d", *f.FlagID)
	}
	if f.ActorID != nil {
		qb.Add("a.actor_user_id = $%d", *f.ActorID)
	}
	if f.Action != nil {
		qb.Add("a.action = $%d", *f.Action)
	}
	if f.From != nil {
		qb.Add("a.occurred_at >= $%d", *f.From)
	}
	if f.To != nil {
		qb.Add("a.occurred_at <= $%d", *f.To)
	}
	where, args := qb.Build()
	whereClause := "WHERE 1=1" + where

	var total int
	if err := r.db.Pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM audit_log a "+whereClause, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	f.Page, f.PageSize = model.ClampPage(f.Page, f.PageSize)
	offset := (f.Page - 1) * f.PageSize
	listQ := fmt.Sprintf(`
		SELECT a.id, a.occurred_at, a.actor_user_id, u.email AS actor_email,
		       a.company_id, a.team_id, a.flagset_id, a.flag_id, a.action, a.target_type, a.target_id,
		       a.before, a.after, a.metadata
		FROM audit_log a
		LEFT JOIN users u ON u.id = a.actor_user_id
		%s
		ORDER BY a.occurred_at DESC, a.id DESC
		LIMIT $%d OFFSET $%d`, whereClause, len(args)+1, len(args)+2)
	args = append(args, f.PageSize, offset)

	rows, err := r.db.Pool.Query(ctx, listQ, args...)
	if err != nil {
		return nil, 0, err
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[model.AuditEntry])
	return out, total, err
}
