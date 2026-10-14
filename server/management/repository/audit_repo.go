package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var (
	// ErrAuditNoCompany means the entry has no CompanyID and its TeamID doesn't
	// resolve to a team (e.g. the team was deleted first), or TeamID names a
	// team of another company. Audit scoping relies on company_id, so such an
	// entry would be invisible to, or leak into, the wrong company's admins.
	ErrAuditNoCompany = errors.New(
		"audit entry has no company: set CompanyID or an existing TeamID, and TeamID must belong to CompanyID")
	// ErrAuditMemberScope guards against a member scope that would otherwise
	// return company-level events of every company.
	ErrAuditMemberScope = errors.New("audit scope: MemberUserID requires CompanyID")
)

type AuditRepo struct{ db *DB }

func NewAuditRepo(db *DB) *AuditRepo { return &AuditRepo{db: db} }

type AuditInput struct {
	ActorUserID *string
	CompanyID   *string
	TeamID      *string
	FlagsetID   *string
	FlagID      *string
	Action      model.AuditAction
	TargetType  model.AuditTargetType
	TargetID    string
	Before      any
	After       any
	Metadata    any
}

// Record writes an audit entry, inside tx when it is not nil. CompanyID may be
// omitted when TeamID names a team that still exists; otherwise Record returns
// ErrAuditNoCompany, so callers deleting a team must pass CompanyID.
func (r *AuditRepo) Record(ctx context.Context, tx pgx.Tx, in AuditInput) error {
	var err error
	if tx == nil {
		err = r.record(ctx, r.db.Pool.Exec, in)
	} else {
		// A failed statement aborts the whole Postgres tx; the savepoint keeps
		// the caller's change committable when it drops the audit error.
		err = pgx.BeginFunc(ctx, tx, func(sp pgx.Tx) error { return r.record(ctx, sp.Exec, in) })
	}
	// Most callers treat audit as best-effort and drop the error, so log it here
	// to keep a broken audit pipeline visible.
	if err != nil {
		slog.ErrorContext(ctx, "audit write failed",
			"action", in.Action, "target_type", in.TargetType, "target_id", in.TargetID, "error", err)
	}
	return err
}

type execFunc func(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)

func (r *AuditRepo) record(ctx context.Context, exec execFunc, in AuditInput) error {
	before, errBefore := marshalAny(in.Before)
	after, errAfter := marshalAny(in.After)
	meta, errMeta := marshalAny(in.Metadata)
	if err := errors.Join(errBefore, errAfter, errMeta); err != nil {
		return fmt.Errorf("marshal audit payload: %w", err)
	}

	// actor_email is a snapshot so the entry keeps its actor after the user is
	// deleted. The WHERE turns an unresolvable company, or a team of another
	// company, into zero rows.
	q := `INSERT INTO audit_log (actor_user_id, actor_email, company_id, team_id, flagset_id, flag_id,
	                            action, target_type, target_id, before, after, metadata)
	      SELECT $1::uuid, (SELECT email FROM users WHERE id = $1::uuid), c.id,
	             $3::uuid, $4::uuid, $5::uuid, $6::text, $7::text, $8::text, $9::jsonb, $10::jsonb, $11::jsonb
	      FROM (SELECT COALESCE($2::uuid, (SELECT company_id FROM teams WHERE id = $3::uuid)) AS id) c
	      WHERE c.id IS NOT NULL
	        AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.id = $3::uuid AND t.company_id <> c.id)`
	args := []any{
		in.ActorUserID, in.CompanyID, in.TeamID, in.FlagsetID, in.FlagID,
		in.Action, in.TargetType, in.TargetID, before, after, meta,
	}
	ct, err := exec(ctx, q, args...)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrAuditNoCompany
	}
	return nil
}

// marshalAny encodes an audit payload. nil, a typed nil pointer and an empty
// RawMessage all become SQL NULL, so the API omits them instead of sending null.
func marshalAny(v any) (any, error) {
	if raw, ok := v.(json.RawMessage); ok && len(raw) == 0 {
		return nil, nil
	}
	b, err := json.Marshal(v)
	if err != nil || string(b) == "null" {
		return nil, err
	}
	return b, nil
}

// List returns one page of entries, newest first, and the total matching count.
// Both are read in one repeatable-read snapshot so they agree with each other.
func (r *AuditRepo) List(
	ctx context.Context, scope model.AuditScope, f model.AuditFilters,
) ([]model.AuditEntry, int, error) {
	if scope.MemberUserID != nil && scope.CompanyID == nil {
		return nil, 0, ErrAuditMemberScope
	}
	qb := auditConditions(scope, f)
	where, countArgs := qb.Build()
	whereClause := "WHERE 1=1" + where

	f.Page, f.PageSize = model.ClampPage(f.Page, f.PageSize)
	limit, offset := qb.Arg(f.PageSize), qb.Arg((f.Page-1)*f.PageSize)
	_, listArgs := qb.Build()
	listQ := fmt.Sprintf(`
		SELECT a.id, a.occurred_at, a.actor_user_id, a.actor_email,
		       a.company_id, a.team_id, a.flagset_id, a.flag_id, a.action, a.target_type, a.target_id,
		       a.before, a.after, a.metadata
		FROM audit_log a
		%s
		ORDER BY a.occurred_at DESC, a.id DESC
		LIMIT %s OFFSET %s`, whereClause, limit, offset)

	var (
		out   []model.AuditEntry
		total int
	)
	txOpts := pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly}
	err := pgx.BeginTxFunc(ctx, r.db.Pool, txOpts, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx,
			"SELECT COUNT(*) FROM audit_log a "+whereClause, countArgs...).Scan(&total); err != nil {
			return err
		}
		// CollectRows reports a failed Query through rows.Err.
		rows, _ := tx.Query(ctx, listQ, listArgs...)
		var err error
		out, err = pgx.CollectRows(rows, pgx.RowToStructByName[model.AuditEntry])
		return err
	})
	if err != nil {
		return nil, 0, err
	}
	return out, total, nil
}

func auditConditions(scope model.AuditScope, f model.AuditFilters) *QueryBuilder {
	qb := NewQueryBuilder(0)
	// Record guarantees company_id on every entry, so tenant isolation is a
	// plain indexed match.
	if scope.CompanyID != nil {
		qb.Add("a.company_id = $%d", *scope.CompanyID)
	}
	if scope.MemberUserID != nil {
		// Team-less entries are only shown when they target the company itself:
		// a team, flagset or flag event recorded without TeamID would otherwise
		// be visible to every member.
		qb.Add("a.team_id IN (SELECT team_id FROM team_members WHERE user_id = $%d)"+
			" OR (a.team_id IS NULL AND a.target_type IN ('company', 'company_member'))", *scope.MemberUserID)
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
	if f.ActorUserID != nil {
		qb.Add("a.actor_user_id = $%d", *f.ActorUserID)
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
	return qb
}
