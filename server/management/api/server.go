package api

import (
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/handler"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
	emw "github.com/labstack/echo/v5/middleware"
	echoSwagger "github.com/swaggo/echo-swagger/v2"
)

type Handlers struct {
	Auth       *handler.AuthHandler
	Companies  *handler.CompanyHandler
	Teams      *handler.TeamHandler
	Flagsets   *handler.FlagsetHandler
	Flags      *handler.FlagHandler
	Versions   *handler.VersionHandler
	Audit      *handler.AuditHandler
	Onboarding *handler.OnboardingHandler
	Config     *handler.ConfigHandler
}

type Services struct {
	Auth      *service.AuthService
	Companies *service.CompanyService
	Teams     *service.TeamService
	Flagsets  *service.FlagsetService
	Flags     *service.FlagService
}

func New(cfg config.Config, log *slog.Logger, h Handlers, s Services) *echo.Echo {
	e := echo.New()
	e.Logger = log
	// First, so the route reaches otelhttp before any middleware swaps the request.
	e.Use(middleware.RouteTelemetry())
	// Tag every log line written through c.Logger() with the request id.
	e.Use(emw.RequestIDWithConfig(emw.RequestIDConfig{
		RequestIDHandler: func(c *echo.Context, id string) { c.SetLogger(log.With("request_id", id)) },
	}))
	// The logger wraps Recover so recovered panics are logged with their stack.
	e.Use(middleware.RequestLogger(log))
	e.Use(emw.Recover())
	hsts := 0
	if cfg.Auth.CookieSecure {
		hsts = 365 * 24 * 3600
	}
	e.Use(emw.SecureWithConfig(emw.SecureConfig{
		ContentTypeNosniff: "nosniff",
		XFrameOptions:      "DENY",
		HSTSMaxAge:         hsts,
		ReferrerPolicy:     "no-referrer",
	}))
	// The webui is the only browser client. An absolute PostLoginRedirect means it
	// is served from another origin (dev: Vite on goff.local:5173), the only one
	// allowed to call the API with credentials. A relative one means same-origin:
	// no CORS at all (echo's CORS refuses an empty allow-list).
	cop := http.NewCrossOriginProtection()
	if origin := webuiOrigin(cfg.Auth.PostLoginRedirect); origin != "" {
		// Before BodyLimit so its 413s carry CORS headers too.
		e.Use(emw.CORSWithConfig(emw.CORSConfig{
			AllowOrigins:     []string{origin},
			AllowCredentials: true,
			AllowMethods: []string{
				http.MethodGet, http.MethodPost, http.MethodPut,
				http.MethodPatch, http.MethodDelete, http.MethodOptions,
			},
			AllowHeaders:  []string{echo.HeaderContentType, echo.HeaderAccept},
			ExposeHeaders: []string{echo.HeaderXRequestID},
		}))
		_ = cop.AddTrustedOrigin(origin) // same validation as CORS, which already panicked on a bad origin
	}
	// CSRF: auth is a cookie, so reject cross-origin browser writes. Safe methods
	// (the OIDC redirects) and non-browser clients always pass.
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			if err := cop.Check(c.Request()); err != nil {
				return c.JSON(http.StatusForbidden, model.APIResponse{Message: "cross-origin request rejected"})
			}
			return next(c)
		}
	})
	// Cap request bodies so a single client can't force the server to decode an
	// unbounded payload into memory (the Viewer-reachable POST /flags/:id/evaluate
	// route then drives it through the CPU-bound evaluation engine). Tune if a
	// legitimate flag payload ever exceeds this.
	e.Use(emw.BodyLimit(256 * 1024))
	e.Use(emw.ContextTimeout(30 * time.Second))

	e.GET("/health", func(c *echo.Context) error {
		return c.JSON(200, model.APIResponse{Data: map[string]string{"status": "ok"}})
	})

	// Login is the public surface and each callback costs an OAuth exchange.
	// Keyed by RealIP, i.e. the socket address: behind a reverse proxy every
	// client shares the proxy's IP, so this becomes a global 5 req/s limit
	// (configure e.IPExtractor for trusted proxies if that bites).
	loginLimit := rateLimit(5, nil)
	e.GET("/auth/login", h.Auth.Login, loginLimit)
	e.GET("/auth/callback", h.Auth.Callback, loginLimit)
	e.POST("/auth/logout", h.Auth.Logout)
	// Outside the auth group so an expired session can still log out.
	e.POST("/api/v1/auth/logout", h.Auth.Logout)

	// Public: the webui reads it before login.
	e.GET("/api/v1/config", h.Config.Get)

	auth := middleware.RequireAuth(s.Auth)

	// Off by default; when on, still requires a session (it is HTML served on
	// the origin that holds the session cookie).
	if cfg.Server.EnableSwagger {
		e.GET("/swagger/*", echoSwagger.WrapHandler, auth)
	}

	// Authenticated responses (flagset API keys included) must not be cached.
	// They are JSON only, so a CSP that loads nothing costs nothing (kept off
	// /swagger/*, which needs scripts).
	apiHeaders := func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			h := c.Response().Header()
			h.Set(echo.HeaderCacheControl, "no-store")
			h.Set(echo.HeaderContentSecurityPolicy, "default-src 'none'; frame-ancestors 'none'")
			return next(c)
		}
	}

	api := e.Group("/api/v1", apiHeaders, auth)
	api.GET("/auth/me", h.Auth.Me)

	registerOnboardingRoutes(api, h)
	registerCompanyRoutes(api, h, s)
	registerTeamRoutes(api, h, s)
	registerFlagsetRoutes(api, h, s)
	registerFlagRoutes(api, h, s)
	registerVersionRoutes(api, h, s)
	api.GET("/audit", h.Audit.List)

	return e
}

// rateLimit caps each identifier (default: client IP) at perSec requests per
// second, burst perSec, answering 429 in the usual envelope.
// ponytail: in-memory per instance; use a shared Store if the API is replicated.
func rateLimit(perSec float64, id emw.Extractor) echo.MiddlewareFunc {
	return emw.RateLimiterWithConfig(emw.RateLimiterConfig{
		Store:               emw.NewRateLimiterMemoryStore(perSec),
		IdentifierExtractor: id,
		DenyHandler: func(c *echo.Context, _ string, _ error) error {
			return c.JSON(http.StatusTooManyRequests, model.APIResponse{Message: "too many requests"})
		},
	})
}

// webuiOrigin returns the scheme://host[:port] of an absolute redirect URL, or
// "" for a relative one. It is normalized to the form browsers send in Origin
// (lowercase, no default port): CrossOriginProtection matches it exactly.
func webuiOrigin(redirect string) string {
	u, err := url.Parse(redirect)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return ""
	}
	host := strings.ToLower(u.Host)
	switch u.Scheme {
	case "http":
		host = strings.TrimSuffix(host, ":80")
	case "https":
		host = strings.TrimSuffix(host, ":443")
	}
	return u.Scheme + "://" + host
}
