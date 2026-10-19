// Package main is the entry point of the GO Feature Flag Management API.
//
// @title       GO Feature Flag Management API
// @version     0.1.0
// @description Source-of-truth API for managing GO Feature Flag flagsets, flags, teams, and audit history.
// @description Every route except GET /config and POST /auth/logout requires the HttpOnly `goff_mgmt_session`
// @description session cookie set by the OIDC login (GET /auth/login, outside this base path;
// @description see docs/reference/api.md)
// @description and answers 401 without it. Errors use the `{message, errors?}` envelope (model.APIResponse).
// @BasePath    /api/v1
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/api"
	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/db/migrations"
	_ "github.com/gofeatureflag/flag-management-system/server/management/docs"
	"github.com/gofeatureflag/flag-management-system/server/management/handler"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/gofeatureflag/flag-management-system/server/management/telemetry"
	"github.com/labstack/echo/v5"
	"github.com/spf13/pflag"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	err := run(ctx, os.Args[1:])
	cancel()
	if err != nil {
		fmt.Fprintln(os.Stderr, "fatal:", err)
		os.Exit(1)
	}
}

// run serves the API until ctx is cancelled, then shuts down gracefully.
func run(ctx context.Context, args []string) error {
	fs := pflag.NewFlagSet("goff-management", pflag.ContinueOnError)
	config.RegisterFlags(fs)
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, pflag.ErrHelp) {
			return nil
		}
		return err
	}

	cfg, err := config.Load(fs)
	if err != nil {
		return err
	}
	if err := cfg.Validate(); err != nil {
		return err
	}

	log, err := newLogger(cfg.Log)
	if err != nil {
		return err
	}
	slog.SetDefault(log)

	shutdownTelemetry, err := telemetry.Setup(ctx)
	if err != nil {
		return fmt.Errorf("telemetry: %w", err)
	}
	defer func() {
		// ctx is already cancelled here; flush with a fresh deadline.
		flushCtx, c := context.WithTimeout(context.Background(), 5*time.Second)
		defer c()
		if err := shutdownTelemetry(flushCtx); err != nil {
			log.Warn("telemetry shutdown", "error", err)
		}
	}()

	db, err := repository.NewDB(ctx, cfg.DB)
	if err != nil {
		return err
	}
	defer db.Close()
	if cfg.DB.Migrate {
		n, err := migrations.Up(ctx, db.Pool)
		if err != nil {
			return fmt.Errorf("migrate: %w", err)
		}
		log.Info("database migrated", "applied", n)
	}

	e, err := newRouter(ctx, cfg, log, db)
	if err != nil {
		return err
	}

	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	srv := &http.Server{
		Addr: addr,
		Handler: otelhttp.NewHandler(e, "http.server",
			otelhttp.WithFilter(func(r *http.Request) bool { return r.URL.Path != "/health" })),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("starting server", "addr", addr)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		log.Info("shutdown signal received")
		shutdownCtx, c2 := context.WithTimeout(context.Background(), cfg.Server.ShutdownTimeout)
		defer c2()
		return srv.Shutdown(shutdownCtx)
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

// newRouter wires every repository, service and handler on db into the API.
func newRouter(ctx context.Context, cfg *config.Config, log *slog.Logger, db *repository.DB) (*echo.Echo, error) {
	userRepo := repository.NewUserRepo(db)
	companyRepo := repository.NewCompanyRepo(db)
	teamRepo := repository.NewTeamRepo(db)
	flagsetRepo := repository.NewFlagsetRepo(db)
	flagRepo := repository.NewFlagRepo(db)
	versionRepo := repository.NewFlagVersionRepo(db)
	auditRepo := repository.NewAuditRepo(db)

	authSvc, err := service.NewAuthService(ctx, *cfg, userRepo, companyRepo)
	if err != nil {
		return nil, err
	}
	mono := !cfg.Server.MultiCompany
	companySvc := service.NewCompanyService(companyRepo, userRepo, auditRepo, mono)
	teamSvc := service.NewTeamService(teamRepo, userRepo, companyRepo, auditRepo)
	flagsetSvc := service.NewFlagsetService(flagsetRepo, auditRepo)
	flagSvc := service.NewFlagService(db, flagRepo, versionRepo, flagsetRepo, auditRepo)

	handlers := api.Handlers{
		Auth:      handler.NewAuthHandler(*cfg, authSvc, userRepo, teamSvc, companySvc),
		Companies: handler.NewCompanyHandler(companySvc, teamSvc),
		Teams:     handler.NewTeamHandler(teamSvc),
		Flagsets:  handler.NewFlagsetHandler(flagsetSvc),
		Flags:     handler.NewFlagHandler(flagSvc),
		Versions: handler.NewVersionHandler(
			service.NewVersionService(db, flagRepo, versionRepo, flagsetRepo, auditRepo)),
		Audit: handler.NewAuditHandler(service.NewAuditService(auditRepo, companyRepo)),
		Onboarding: handler.NewOnboardingHandler(
			service.NewOnboardingService(companyRepo, userRepo, auditRepo, mono)),
		Config: handler.NewConfigHandler(*cfg),
	}
	services := api.Services{Auth: authSvc, Companies: companySvc, Teams: teamSvc, Flagsets: flagsetSvc, Flags: flagSvc}
	return api.New(*cfg, log, handlers, services), nil
}

// newLogger builds the logger for log.level and log.format, which
// Config.Validate restricts to known values; anything else is an error here
// too, so a format the validator accepts can't silently fall back to JSON.
func newLogger(cfg config.LogConfig) (*slog.Logger, error) {
	opts := &slog.HandlerOptions{}
	if cfg.Level != "" {
		var lvl slog.Level
		if err := lvl.UnmarshalText([]byte(cfg.Level)); err != nil {
			return nil, err
		}
		opts.Level = lvl
	}
	switch cfg.Format {
	case "text":
		return slog.New(slog.NewTextHandler(os.Stderr, opts)), nil
	case "", "json":
		return slog.New(slog.NewJSONHandler(os.Stderr, opts)), nil
	default:
		return nil, fmt.Errorf("invalid log.format %q: expected json or text", cfg.Format)
	}
}
