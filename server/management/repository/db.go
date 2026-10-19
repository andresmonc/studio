package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/exaring/otelpgx"
	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	// ErrNotFound is returned by lookups (GetByID, GetByEmail...) when no live
	// row matches. Optional reads (Membership, GetRole, First) return nil or ""
	// instead: having none is a normal state there.
	ErrNotFound           = errors.New("not found")
	ErrConflictOrNotFound = errors.New("conflict or not found")
)

type DB struct {
	Pool *pgxpool.Pool
}

func NewDB(ctx context.Context, cfg config.DBConfig) (*DB, error) {
	pcfg, err := pgxpool.ParseConfig(cfg.URL)
	if err != nil {
		return nil, fmt.Errorf("parse db url: %w", err)
	}
	if cfg.MaxConns > 0 {
		pcfg.MaxConns = cfg.MaxConns
	}
	if cfg.MinConns > 0 {
		pcfg.MinConns = cfg.MinConns
	}
	if cfg.ConnMaxLifetime > 0 {
		pcfg.MaxConnLifetime = cfg.ConnMaxLifetime
	}
	// A span per query (SQL in db.query.text), via the global tracer provider.
	pcfg.ConnConfig.Tracer = otelpgx.NewTracer()

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, pcfg)
	if err != nil {
		return nil, fmt.Errorf("connect db: %w", err)
	}
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping db: %w", err)
	}
	var versionNum int
	var version string
	if err := pool.QueryRow(pingCtx, `SELECT current_setting('server_version_num')::int,
		current_setting('server_version')`).Scan(&versionNum, &version); err != nil {
		pool.Close()
		return nil, fmt.Errorf("read db server version: %w", err)
	}
	if err := requireServerVersion(versionNum, version); err != nil {
		pool.Close()
		return nil, err
	}
	if err := otelpgx.RecordStats(pool); err != nil {
		pool.Close()
		return nil, fmt.Errorf("db pool metrics: %w", err)
	}
	return &DB{Pool: pool}, nil
}

// minServerVersionNum is the oldest Postgres the schema runs on (as in
// server_version_num): uuidv7() and VIRTUAL generated columns are new in 18.
const minServerVersionNum = 180000

// requireServerVersion fails on a server older than PostgreSQL 18 with a clear
// message, instead of an obscure error at migration time.
func requireServerVersion(num int, version string) error {
	if num < minServerVersionNum {
		return fmt.Errorf("PostgreSQL 18 or later is required, found %s", version)
	}
	return nil
}

func (d *DB) Close() {
	if d.Pool != nil {
		d.Pool.Close()
	}
}

// execOne runs a write that must touch at least one row; zero rows → ErrNotFound.
func (d *DB) execOne(ctx context.Context, q string, args ...any) error {
	ct, err := d.Pool.Exec(ctx, q, args...)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// isNoRows reports a query that matched nothing. A malformed id (pg 22P02) is
// not folded in: the API rejects those before any query (middleware.ValidIDs),
// so a failed cast here is a bug to surface, not a missing row.
func isNoRows(err error) bool { return errors.Is(err, pgx.ErrNoRows) }
