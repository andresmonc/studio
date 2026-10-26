package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewLogger(t *testing.T) {
	tests := []struct {
		name        string
		cfg         config.LogConfig
		wantHandler string
		wantErr     string
	}{
		{"json by default", config.LogConfig{}, "*slog.JSONHandler", ""},
		{"json", config.LogConfig{Format: "json", Level: "debug"}, "*slog.JSONHandler", ""},
		{"text", config.LogConfig{Format: "text"}, "*slog.TextHandler", ""},
		{"unknown format", config.LogConfig{Format: "consol"}, "", `invalid log.format "consol"`},
		{"unknown level", config.LogConfig{Level: "loud"}, "", "loud"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			log, err := newLogger(tt.cfg)
			if tt.wantErr != "" {
				assert.ErrorContains(t, err, tt.wantErr)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.wantHandler, typeName(log.Handler()))
		})
	}
}

func typeName(h slog.Handler) string {
	switch h.(type) {
	case *slog.JSONHandler:
		return "*slog.JSONHandler"
	case *slog.TextHandler:
		return "*slog.TextHandler"
	}
	return "other"
}

// fakeIssuer serves just the OIDC discovery document NewAuthService fetches.
func fakeIssuer(t *testing.T) string {
	t.Helper()
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]string{
			"issuer":                 srv.URL,
			"authorization_endpoint": srv.URL + "/auth",
			"token_endpoint":         srv.URL + "/token",
			"jwks_uri":               srv.URL + "/keys",
		})
	}))
	t.Cleanup(srv.Close)
	return srv.URL
}

func freePort(t *testing.T) int {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer func() { _ = l.Close() }()
	return l.Addr().(*net.TCPAddr).Port
}

func TestRun(t *testing.T) {
	dbURL := testutil.StartPostgres(t).Pool.Config().ConnString()
	issuer := fakeIssuer(t)
	t.Setenv("GOFF_MGMT_DB_URL", "")
	t.Setenv("GOFF_MGMT_OIDC_CLIENTID", "client")
	t.Setenv("GOFF_MGMT_OIDC_CLIENTSECRET", "secret")
	t.Setenv("GOFF_MGMT_OIDC_REDIRECTURL", "http://localhost/auth/callback")
	t.Setenv("GOFF_MGMT_AUTH_JWTSECRET", "0123456789abcdef0123456789abcdef")

	tests := []struct {
		name    string
		issuer  string
		args    []string
		wantErr string
	}{
		{name: "help", args: []string{"--help"}},
		{name: "unknown flag", args: []string{"--nope"}, wantErr: "unknown flag: --nope"},
		{name: "missing config file", args: []string{"--config", "/does/not/exist.yaml"}, wantErr: "load config file"},
		{name: "invalid config", issuer: issuer, wantErr: "db.url is required"},
		{name: "unreachable db", issuer: issuer, args: []string{"--db.url", "postgres://x:x@127.0.0.1:1/x"},
			wantErr: "ping db"},
		{name: "unreachable issuer", issuer: "http://127.0.0.1:1", args: []string{"--db.url", dbURL},
			wantErr: "init oidc provider"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("GOFF_MGMT_OIDC_ISSUER", tt.issuer)
			err := run(t.Context(), tt.args)
			if tt.wantErr == "" {
				assert.NoError(t, err)
				return
			}
			assert.ErrorContains(t, err, tt.wantErr)
		})
	}

	t.Run("serves until cancelled", func(t *testing.T) {
		t.Setenv("GOFF_MGMT_OIDC_ISSUER", issuer)
		serveUntilHealthy(t, dbURL)
	})

	t.Run("failed migration stops startup", func(t *testing.T) {
		t.Setenv("GOFF_MGMT_OIDC_ISSUER", issuer)
		url := testutil.EmptyDatabase(t)
		conn, err := pgx.Connect(t.Context(), url)
		require.NoError(t, err)
		// A table in the way of the first migration.
		_, err = conn.Exec(t.Context(), `CREATE TABLE companies (id int)`)
		require.NoError(t, err)
		require.NoError(t, conn.Close(t.Context()))
		err = run(t.Context(), []string{"--db.url", url, "--server.port", fmt.Sprint(freePort(t))})
		assert.ErrorContains(t, err, "migrate:")
	})

	// A fresh database gets its schema at startup unless db.migrate is off.
	for _, tt := range []struct {
		migrate    string
		wantSchema bool
	}{{"", true}, {"false", false}} {
		t.Run("empty database, GOFF_MGMT_DB_MIGRATE="+tt.migrate, func(t *testing.T) {
			t.Setenv("GOFF_MGMT_OIDC_ISSUER", issuer)
			t.Setenv("GOFF_MGMT_DB_MIGRATE", tt.migrate)
			url := testutil.EmptyDatabase(t)
			serveUntilHealthy(t, url)
			conn, err := pgx.Connect(t.Context(), url)
			require.NoError(t, err)
			defer func() { _ = conn.Close(context.Background()) }()
			var hasFlags bool
			require.NoError(t, conn.QueryRow(t.Context(), `SELECT to_regclass('flags') IS NOT NULL`).Scan(&hasFlags))
			assert.Equal(t, tt.wantSchema, hasFlags)
		})
	}

	t.Run("port in use", func(t *testing.T) {
		t.Setenv("GOFF_MGMT_OIDC_ISSUER", issuer)
		l, err := net.Listen("tcp", ":0")
		require.NoError(t, err)
		defer func() { _ = l.Close() }()
		port := l.Addr().(*net.TCPAddr).Port
		err = run(t.Context(), []string{"--db.url", dbURL, "--server.port", fmt.Sprint(port)})
		assert.ErrorContains(t, err, "address already in use")
	})
}

// serveUntilHealthy runs the server on dbURL until /health answers, then
// stops it and checks it shut down cleanly.
func serveUntilHealthy(t *testing.T, dbURL string) {
	t.Helper()
	port := freePort(t)
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- run(ctx, []string{"--db.url", dbURL, "--server.port", fmt.Sprint(port)}) }()

	assert.EventuallyWithT(t, func(c *assert.CollectT) {
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/health", port))
		if assert.NoError(c, err) {
			_ = resp.Body.Close()
			assert.Equal(c, http.StatusOK, resp.StatusCode)
		}
	}, 10*time.Second, 50*time.Millisecond)
	cancel()
	select {
	case err := <-done:
		assert.NoError(t, err)
	case <-time.After(10 * time.Second):
		t.Fatal("run did not return after cancel")
	}
}
