# Deploying the management API

GO Feature Flag Studio is a work in progress: this guide covers the management API
(`server/management`) as it is today. There is no release image yet.

## Requirements

- **PostgreSQL 18 or later.** The schema uses `uuidv7()` and virtual generated columns. The
  server checks the version when it connects and refuses to start on an older one.
- **An OpenID Connect provider** (Keycloak, Auth0, Okta, Google, ...) with a confidential
  client for Studio.
- **HTTPS in front of the server** (a reverse proxy or load balancer). Session cookies are
  `Secure` by default.

## Build and run

```sh
cd server/management
go build -o goff-management .
./goff-management --config /etc/goff/management.yaml
```

The server listens on `server.port` (8080 by default) and answers `GET /health` without a
session, for liveness and readiness probes. It stops gracefully on `SIGTERM`, waiting up to
`server.shutdownTimeout` for in-flight requests.

## Configuration

Settings are read from, in increasing priority:

1. built-in defaults,
2. a YAML file passed with `--config` (keys as in the table below, e.g. `auth.cookieSecure`),
3. environment variables: `GOFF_MGMT_` + the key in upper case with `.` replaced by `_`
   (`auth.cookieSecure` → `GOFF_MGMT_AUTH_COOKIESECURE`),
4. command-line flags (`--server.port`, `--server.multicompany`, `--db.url`, `--log.level`).

A few rules apply to every source:

- An environment variable set to an empty string is ignored, so `VAR=${UNSET}` in Compose
  doesn't wipe a default.
- Lists are comma-separated in environment variables (`a@x.com, b@x.com`); spaces around
  items are trimmed.
- Durations need a unit: `30s`, `5m`, `24h`. A bare number would be nanoseconds, so any
  duration under one second is rejected at startup.

The server validates the whole configuration at startup and reports every problem at once.

| Key | Default | Notes |
|---|---|---|
| `server.port` | `8080` | |
| `server.shutdownTimeout` | `15s` | |
| `server.enableSwagger` | `false` | Serves `/swagger/index.html`; still requires a session. |
| `server.multiCompany` | `false` | See [Companies](#companies). |
| `server.trustedProxies` | (none) | CIDR ranges of your reverse proxies. See [Behind a reverse proxy](#behind-a-reverse-proxy). |
| `db.url` | **required** | PostgreSQL DSN, e.g. `postgres://user:pass@host:5432/goff?sslmode=require`. |
| `db.maxConns` / `db.minConns` | `20` / `2` | Connection pool size. |
| `db.connMaxLifetime` | `1h` | |
| `db.migrate` | `true` | See [Database migrations](#database-migrations). |
| `oidc.issuer` | **required** | The provider's issuer URL; its discovery document must be reachable at startup. |
| `oidc.clientId` / `oidc.clientSecret` | **required** | |
| `oidc.redirectUrl` | **required** | `https://<studio host>/auth/callback`, registered at the provider. |
| `oidc.scopes` | `openid,profile,email` | Must include `openid`. |
| `auth.jwtSecret` | **required** | At least 32 characters; signs the session tokens. Rotating it logs everyone out. |
| `auth.sessionMaxAge` | `24h` | |
| `auth.cookieSecure` | `true` | Only turn off for local http development. |
| `auth.cookieDomain` | (none) | See [Sessions and cookies](#sessions-and-cookies). |
| `auth.adminEmails` | (none) | Super admins, matched case-insensitively on the verified login email. |
| `auth.postLoginRedirect` | `/` | Where the browser lands after login: a path, or the web UI's absolute URL. |
| `auth.allowUnverifiedEmail` | `false` | Accept logins without `email_verified: true`. When the ID token omits the claim (Okta's org authorization server does), Studio reads it from `/userinfo` first. Unverified logins never get super admin. |
| `log.level` | `info` | `debug`, `info`, `warn` or `error`. |
| `log.format` | `json` | `json` or `text`. |

Keep `db.url`, `oidc.clientSecret` and `auth.jwtSecret` out of the YAML file: pass them as
environment variables from your secret store.

## Database migrations

The schema migrations are embedded in the binary and applied at startup, before the server
accepts requests. A Postgres advisory lock serializes them, so several replicas can start at
once.

To run migrations yourself (for example from a release job), set `db.migrate=false` and apply
`server/management/db/migrations` with the [goose](https://github.com/pressly/goose) CLI:

```sh
goose -dir server/management/db/migrations postgres "$GOFF_MGMT_DB_URL" up
```

## Behind a reverse proxy

Terminate TLS at the proxy and forward to the server over http.

- **Client IP.** Login is rate limited per client IP (5 requests/s), and logs record it.
  Behind a proxy the socket address is the proxy's, so every user would share one bucket.
  List the proxy ranges in `server.trustedProxies`; the server then reads the client from
  `X-Forwarded-For`, trusting only hops inside those ranges.
- **HSTS.** With `auth.cookieSecure` on, the server sends `Strict-Transport-Security`.

## Sessions and cookies

Login goes through `GET /auth/login` and `GET /auth/callback`. The session is a signed token
in an `HttpOnly` cookie, valid for `auth.sessionMaxAge`. Logging out ends every session of
that user, including copies of the token. Privileges and email are re-read from the database
on every request, so a demotion or a deleted user takes effect immediately.

Cookie names depend on the deployment:

- **Web UI and API on the same host** (`auth.cookieDomain` empty): the cookies are named
  `__Host-goff_mgmt_session` and `__Host-goff_mgmt_oidc_state`. Browsers then refuse a
  cookie of that name set by any other subdomain.
- **Web UI on another subdomain** (`auth.cookieDomain=example.com`): the session cookie is
  shared with that domain and named `goff_mgmt_session`. Any host under the domain can then
  set it, so only use this when you control every subdomain.

When `auth.postLoginRedirect` is an absolute URL (e.g. `https://studio.example.com/`), its
origin is the only one allowed to call the API with credentials (CORS) and to send writes.

## Companies

- **Mono company** (default): the first super admin creates the single company during
  onboarding, and every user who logs in joins it as a member. Members can't be removed in
  this mode: revoke their access at the identity provider instead.
- **Multi company** (`server.multiCompany=true`): super admins create companies, each with a
  first admin, and company admins add users by email.

## Observability

- Logs go to stderr, as JSON by default; each request line carries a `request_id`, also
  returned in the `X-Request-ID` header.
- Traces and metrics use OpenTelemetry and are configured with the standard `OTEL_*`
  environment variables (`OTEL_TRACES_EXPORTER`, `OTEL_METRICS_EXPORTER`,
  `OTEL_EXPORTER_OTLP_ENDPOINT`, ...). Nothing is exported when they are unset.
