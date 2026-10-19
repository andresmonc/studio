// Package testutil provides a shared Postgres test harness for the management
// server's integration tests. It boots a throwaway Postgres container (via
// testcontainers), applies the embedded migrations, and hands out a clean
// repository.DB to each test.
//
// Tests that call StartPostgres are skipped (not failed) when Docker is
// unavailable or when -short is set, so the pure-unit suite stays runnable
// everywhere. In CI (CI env var set) an unavailable Docker fails the test.
// Setup errors once the container is up (migrations, pool) always fail.
package testutil

import (
	"context"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/db/migrations"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/jackc/pgx/v5"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// The container is reaped by the testcontainers Ryuk reaper when the test
// process exits, so the harness keeps no teardown of its own.
type harness struct {
	db *repository.DB
	// truncate resets every table the migrations created (read from
	// pg_tables once they ran), so a new table can't keep rows between tests.
	truncate string
	err      error
	// unavailable marks err as "container could not start" (e.g. no Docker),
	// the only error worth skipping on.
	unavailable bool
}

var (
	shared     harness
	sharedOnce sync.Once
)

// StartPostgres returns a migrated, empty database shared across the test
// binary. The first call boots the container and applies migrations; later
// calls truncate every table and reuse it, giving each test a clean slate.
// The container is reaped automatically when the test process exits (via the
// testcontainers Ryuk reaper).
//
// Tests using this harness MUST NOT call t.Parallel(): the database is shared
// and truncated on every StartPostgres call, so a parallel sibling would wipe
// another test's rows mid-run.
func StartPostgres(t *testing.T) *repository.DB {
	t.Helper()
	if testing.Short() {
		t.Skip("skipping integration test: -short set")
	}
	sharedOnce.Do(func() { shared = bootstrap() })
	if shared.err != nil {
		// CI (GitHub Actions sets CI=true) must run the integration suite, so a
		// missing harness there is a failure, not a silent skip.
		if !shared.unavailable || os.Getenv("CI") != "" {
			t.Fatalf("postgres test harness setup failed: %v", shared.err)
		}
		// A docker-less environment is an expected condition: skip rather than fail.
		t.Skipf("postgres test harness unavailable (is Docker running?): %v", shared.err)
	}
	if _, err := shared.db.Pool.Exec(context.Background(), shared.truncate); err != nil {
		t.Fatalf("truncate tables: %v", err)
	}
	return shared.db
}

func bootstrap() harness {
	ctx := context.Background()
	ctr, err := postgres.Run(ctx, "postgres:18-alpine",
		postgres.WithDatabase("goff_test"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(90*time.Second)),
	)
	if err != nil {
		return harness{err: err, unavailable: true}
	}
	terminate := func() { _ = ctr.Terminate(context.Background()) }

	connStr, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		terminate()
		return harness{err: err}
	}

	db, err := repository.NewDB(ctx, config.DBConfig{URL: connStr, MaxConns: 8, MinConns: 1})
	if err != nil {
		terminate()
		return harness{err: err}
	}
	// The same embedded migrations the server applies at startup.
	if _, err := migrations.Up(ctx, db.Pool); err != nil {
		db.Close()
		terminate()
		return harness{err: err}
	}
	tables, err := migratedTables(ctx, db)
	if err != nil {
		db.Close()
		terminate()
		return harness{err: err}
	}
	// Order is irrelevant: CASCADE follows the foreign keys.
	return harness{db: db, truncate: "TRUNCATE TABLE " + strings.Join(tables, ", ") + " RESTART IDENTITY CASCADE"}
}

// migratedTables lists the tables in the public schema, quoted, without
// goose's version table.
func migratedTables(ctx context.Context, db *repository.DB) ([]string, error) {
	rows, err := db.Pool.Query(ctx, `SELECT format('%I', tablename) FROM pg_tables
		WHERE schemaname = 'public' AND tablename <> 'goose_db_version' ORDER BY tablename`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// EmptyDatabase creates a fresh database, without any migration applied, in
// the shared container and returns its URL. It is dropped when the test ends.
func EmptyDatabase(t *testing.T) string {
	t.Helper()
	db := StartPostgres(t)
	name := "empty_" + strings.ToLower(strings.NewReplacer("/", "_", " ", "_").Replace(t.Name()))
	name = pgx.Identifier{name}.Sanitize()
	if _, err := db.Pool.Exec(t.Context(), "CREATE DATABASE "+name); err != nil {
		t.Fatalf("create database: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Pool.Exec(context.Background(), "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
	})
	cfg := db.Pool.Config().ConnConfig.Copy()
	u := url.URL{
		Scheme: "postgres", User: url.UserPassword(cfg.User, cfg.Password),
		Host: net.JoinHostPort(cfg.Host, strconv.Itoa(int(cfg.Port))), Path: "/" + strings.Trim(name, `"`),
		RawQuery: "sslmode=disable",
	}
	return u.String()
}
