// Package migrations embeds the goose SQL migrations, so the server binary can
// create and upgrade its schema without the source tree or the goose CLI.
package migrations

import (
	"context"
	"database/sql"
	"embed"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
)

//go:embed *.sql
var files embed.FS

// Up applies every pending migration through pool and returns how many ran. A
// Postgres advisory lock serializes concurrent callers, so replicas starting
// together don't race on the same migration.
func Up(ctx context.Context, pool *pgxpool.Pool) (int, error) {
	sqlDB := stdlib.OpenDBFromPool(pool)
	defer func() { _ = sqlDB.Close() }()

	p, err := newProvider(sqlDB)
	if err != nil {
		return 0, err
	}
	results, err := p.Up(ctx)
	return len(results), err
}

func newProvider(sqlDB *sql.DB) (*goose.Provider, error) {
	locker, err := lock.NewPostgresSessionLocker()
	if err != nil {
		return nil, err
	}
	return goose.NewProvider(goose.DialectPostgres, sqlDB, files, goose.WithSessionLocker(locker))
}
