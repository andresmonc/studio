# Management API reference

The endpoint-by-endpoint reference is the OpenAPI spec generated from the handlers:
`server/management/docs/swagger.yaml`, also served at `/swagger/index.html` when
`server.enableSwagger` is on (it needs a session too). This page covers what the spec doesn't:
how to log in, and the conventions every endpoint follows.

The API lives under `/api/v1`. A few routes sit outside it: `GET /health` and the login flow.

## Authentication

The API uses an `HttpOnly` session cookie set by an OpenID Connect login. There are no API
tokens for the management API (relay-proxy API keys are a separate thing, managed per
flagset).

| Route | |
|---|---|
| `GET /auth/login` | Redirects the browser to the identity provider. Sets a short-lived state cookie (state, PKCE verifier, nonce). |
| `GET /auth/callback` | The provider's redirect target. Checks state, PKCE and nonce, creates or updates the user, sets the session cookie and redirects to `auth.postLoginRedirect`. Answers 400 for a refused or invalid login. |
| `POST /auth/logout`, `POST /api/v1/auth/logout` | Ends every session of the user (copied tokens included) and clears the cookie. Works without a valid session. |
| `GET /api/v1/auth/me` | The current user, their company and team memberships. |
| `GET /api/v1/config` | Public settings the web UI reads before login. |

The session cookie is `__Host-goff_mgmt_session`, or `goff_mgmt_session` when
`auth.cookieDomain` is set or cookies aren't `Secure` (see the
[deployment guide](../deployment.md#sessions-and-cookies)). Every `/api/v1` route except
`/config` and logout answers **401** without a valid session.

Login and callback are rate limited to 5 requests per second per client IP (**429**). No auth
response is cacheable.

## Browser requests

Cross-origin writes from a browser are rejected with **403** unless they come from the web
UI's origin (the origin of `auth.postLoginRedirect` when it is an absolute URL). That origin
is also the only one CORS allows to call the API with credentials.

## Responses

JSON responses use one envelope:

```json
{ "message": "validation failed", "data": …, "errors": { "name": ["name is required"] } }
```

- `data` holds the result on success.
- `message` explains an error; it is safe to show and never contains internals.
- `errors` maps a field to its problems, on validation failures. All problems are reported
  at once.

Paginated lists use `{"data": [...], "total": 42, "page": 1, "pageSize": 50, "totalPages": 1}`.
`page` starts at 1, `pageSize` defaults to 50 and is capped at 200.

## Status codes

| Code | When |
|---|---|
| 200, 201, 204 | Success. A write that changes nothing returns 200 with the current state and records nothing (e.g. a rollback to the version already served). |
| 400 | Invalid body (with the JSON offset or the mistyped field), failed validation (`errors`), or an invalid query parameter. |
| 401 | No valid session. |
| 403 | The caller's role is too low, or a cross-origin browser write. A company, team, flagset or flag that doesn't exist also answers 403 to non-super-admins, so ids of other tenants can't be probed. |
| 404 | Not found, or a malformed id in the path. |
| 409 | A conflict: a name already used, the last admin of a team or company, a second company in mono company mode. |
| 413 | Request body over 256 KiB. |
| 429 | Too many login attempts. |
| 499 | The client closed the connection before the answer (not a server error). |
| 503 | The request took longer than 30 seconds. |

## Roles

Access is checked per team, with three roles: `viewer` < `editor` < `admin`. Company admins
inherit `admin` on every team of their company, and super admins (`auth.adminEmails`) pass
every check. Each operation's minimum role is in its summary in the spec.
