# TODOs

Things the repo references but doesn't have yet.

- [ ] **Add `CONTRIBUTING.md`.** The checklist in `.github/pull_request_template.md` links to it, so that link is broken today.
- [ ] **Change how vulnerabilities are reported.** `SECURITY.md` asks people to report vulnerabilities in public issues. Turn on GitHub private vulnerability reporting and point `SECURITY.md` to it.
- [ ] **Update `AGENTS.md` once Studio has a working version.** It still describes a work in progress: `webui/` is listed as "not created yet" and it says no backward-compat shims are needed. When the API and UI ship, refresh the layout, commands and compatibility rules.

## Config loader

Found while reviewing `server/management/config`, all three still open after `Config.Validate()` (#11).

- [ ] **Ignore `GOFF_MGMT_*` env vars that are set to an empty string.** koanf's env provider loads them and `WeaklyTypedInput` coerces `""` to the zero value, so an empty var silently replaces the default: `GOFF_MGMT_AUTH_COOKIESECURE=` drops the `Secure` flag from session cookies and `GOFF_MGMT_DB_MAXCONNS=` gives a 0-connection pool. Easy to hit with Compose `VAR=${UNSET}` or `docker run -e VAR`. `env.ProviderWithValue` passes the value to the callback, which can then return an empty key to skip the var.
- [ ] **Trim comma-separated env lists.** `StringToSliceHookFunc(",")` keeps surrounding spaces, so `GOFF_MGMT_AUTH_ADMINEMAILS="a@x, b@x"` decodes to `["a@x", " b@x"]` and the second address never matches a login email. Same for `GOFF_MGMT_OIDC_SCOPES`, where `" email"` would be sent to the IdP.
- [ ] **Document that durations need a unit.** `shutdownTimeout: 30` in YAML means 30 nanoseconds, not 30 seconds, because mapstructure assigns a bare number straight onto `time.Duration`. Spell the units out in the config reference, or reject sub-millisecond durations in `Validate()`.

## Roles and user models

Found while reviewing `server/management/model` after team/company roles (#53).

- [ ] **Enforce the `oneof` role validation.** The `validate:"required,oneof=..."` tags on `AddCompanyMemberRequest`, `UpdateCompanyMemberRequest`, `AddMemberRequest` and `UpdateMemberRequest` do nothing, because nothing wires in `go-playground/validator`. Until the handlers run a validator or call `IsValid()` explicitly, `role: "owner"` is accepted and `AtLeast` (which denies unknown roles) is the only protection.
- [ ] **Account for the JSON shape changes in API consumers.** `CompanyMember` now serializes `createdAt`, and `UpdateCompanyRequest`/`UpdateTeamRequest` no longer accept `email`/`role` (they moved to the `Add*MemberRequest` structs). Nothing uses these yet, but any client or handler written against the old shapes needs updating.
- [ ] **Fill two test gaps.** No `AtLeast` test checks that an unknown role (e.g. `Role("owner").AtLeast(RoleViewer)`) is denied. `TestNewMeResponse` doesn't cover a user with `CompanyID` set but `CompanyRole` nil, which would return `company.role: ""`; the `users_company_role_pair` CHECK now rules that state out in the DB, but the Go side still has no test for it.
- [ ] **Rename `User.Role()`.** It returns a `CompanyRole`, while `Role` is also the name of the team role type, so callers can mix the two up. Something like `CompanyRoleOrEmpty()` is clearer.

## Flag evaluation

Left open while reviewing `EvaluateFlag` in `server/management/model/evaluation.go` (#16).

- [ ] **Guard against a nil request.** `EvaluateFlag` reads `req.EvaluationContext` without a nil check, so a nil `*EvaluateFlagRequest` panics. The only caller always passes a request today; add a check (or take the struct by value) if another caller shows up.
- [ ] **Stop silently ignoring a badly formed enrichment.** If the flagset's `evaluationContextEnrichment` isn't a JSON object, the `json.Unmarshal` error is dropped and the flag is evaluated without enrichment. Flagset validation on the later branch should block this; confirm it does once that lands, or return an error here.
- [ ] **Test a percentage rule with no targeting key.** Nice to have: it only exercises the core engine's behaviour, not code in this package.

## Database schema

Left open after the review of `server/management/db/migrations/0001_init.sql`.

- [ ] **Test the migration round-trip and embed it.** The repository tests apply Up through testcontainers, but nothing runs Down and Up again, nothing embeds `db/migrations` for production, and no parity test runs the `InferFlagType` table cases through the generated `flag_versions.flag_type` column (lax jsonpath mode once typed `["a"]` as `string`).
- [ ] **Document the Postgres 18 minimum.** `uuidv7()` and `VIRTUAL` generated columns need PG 18 and `JSON_EXISTS` needs PG 17; the config accepts any DSN and an older server fails at migration time with an obscure error.
- [ ] **Add a company join date if the UI shows one.** `CompanyMember.CreatedAt` can only come from `users.created_at`, so "joined" would mean "account created". Add a `company_joined_at` column when a screen needs the real date.

## Repository

Left open after the reviews of the DB harness, user repo and team repo.

- [ ] **Narrow `isNoRows`.** It also maps pg 22P02 (invalid input) to "not found", which is right for a malformed uuid in `GetByID` but would hide a bad cast in any other query that reuses it (`TeamRepo.GetRole` now relies on it too). Validate the uuid in the lookups and keep `isNoRows` to `pgx.ErrNoRows`.
- [ ] **Return `ErrNotFound` from lookups.** `UserRepo.GetByID`/`GetByEmail`, `CompanyRepo.GetByID`/`First`/`Membership` and `TeamRepo.GetByID` return `(nil, nil)` when nothing matches, and `TeamRepo.GetRole` returns `("", nil)`, so every caller must nil-check the result. Change it before the first caller lands.
- [ ] **Map an unknown parent in `TeamRepo.Create` and `FlagsetRepo.Create`.** A `companyID`/`teamID` that doesn't exist hits the foreign key (23503) and comes back as a raw `*pgconn.PgError`; map it to `ErrNotFound` so the handler can return 404 instead of 500. Same for `pollingIntervalMs: 0`, which hits the `polling_interval_ms > 0` CHECK (23514): the flagset handler must validate it (and `fileFormat`) before calling the repo.
- [ ] **Truncate every table in the test harness.** `allTables` in `internal/testutil/postgres.go` is hard-coded; a new table without a foreign key to it keeps rows between tests. Build the `TRUNCATE` from `pg_tables` (minus `goose_db_version`). The unused `harness.terminate` field goes too, or gets called from a `TestMain` helper for runs with Ryuk disabled.
- [ ] **Use a params struct for `UpsertFromOIDC`.** Its four positional strings (email, name, avatarURL, sub) let a swapped email and sub compile. Cover `avatarURL`, `LastLoginAt` and `UpdatedAt` in the tests while there.
- [ ] **Don't log every audit failure at ERROR.** `AuditRepo.Record` logs `context.Canceled` (client disconnect) and errors the caller already handles, so a caller that logs too gets duplicates and disconnects look like a broken audit pipeline. Skip `errors.Is(err, context.Canceled)` in the log.
- [ ] **Map malformed audit filter ids to a validation error.** `AuditRepo.List` with `TeamID: "abc"` returns a raw 22P02 `*pgconn.PgError` (and `TestAuditRepoListMalformedFilter` asserts the pg text), so a handler that doesn't validate first answers 500 instead of 400. Validate the uuid filters in the audit handler, or map 22P02 here.

## Flags

Left open after the review of the flag and flag version repositories (#24).

- [ ] **Key flag owners by user id.** `ListByTeam`'s `Owner` filter and `ListTeamOwners` use `users.name`, which isn't unique and defaults to `''`: two users named "Alice" collapse into one owner, and a user with an empty name shows up as owner `""` instead of unassigned. Filter on `fv.created_by` and return `{id, name}` pairs.

## Services

Left open after the review of the team service (#26).

- [ ] **Keep a team admin.** `TeamService.Create` refuses an admin-less team, but `RemoveMember` and `UpdateMember` happily remove or demote the last admin. Company admins still inherit admin, so nobody is locked out; either guard the last explicit admin or drop the "never admin-less" wording.
- [ ] **Skip audit entries for no-op writes.** Re-adding a member with the same role writes an update entry where before equals after, a rollback to the current version writes a new identical version, and `TeamService.Update`/`CompanyService.Update` with an empty body bump `updated_at` and write an entry.
- [ ] **Decide whether a company needs an admin at creation.** `CompanyService.Create` (super admin only) creates a company with no members, so it runs admin-less until the super admin adds one, and `ensureNotLastAdmin` has nothing to protect. Onboarding does create the admin. If every company must have one, take an `adminEmail` like teams and create both in one transaction.
- [ ] **Make member removal stick in mono company mode.** `CompanyService.RemoveMember` clears the user's company, but the next login (`AuthService.Exchange` → `joinDefaultCompany`) re-joins them as a member, so offboarding someone whose IdP account still exists doesn't work. Decide: reject `RemoveMember` in mono mode ("manage access at the IdP"), or record the removal (e.g. a `removed_at` column) and skip those users when auto-joining.
- [ ] **Decide whether relay-proxy settings can hold secrets.** Flagset audit entries snapshot the whole flagset, so a retriever/notifier config such as `{"kind":"github","token":"ghp_…"}` lands in `audit_log` in clear. The flagset API returns the same settings in full, so either they're never secret (document it), or both the API and the audit snapshot need masking.
- [ ] **Let a flagset update clear its JSON settings.** `null` for `retrievers`, `exporters`, `notifiers`, `evaluationContextEnrichment` or `defaultTestingEvaluationContext` passes validation but the repo's `COALESCE` keeps the old value, so the client gets 200 and nothing changes. Make them `model.Nullable` like `pollingIntervalMs`/`fileFormat`, or reject `null` on update.
- [ ] **Resolve a flag's team in one query for RBAC.** `RequireFlagRole`/`RequireFlagsetRole` call `FlagsetService.Get`, whose `flagsetCols` carries three `COUNT(*)` subqueries, only to read `team_id`; every flag request (including the rate-limited `/evaluate`) makes about five round trips before the handler. Add a repo lookup `SELECT fs.team_id FROM flags f JOIN flagsets fs … WHERE … deleted_at IS NULL` (and a flagset-only one).

## Auth

Left open after the review of the auth handler (#39).

- [ ] **Harden the auth cookies against sibling subdomains.** With `auth.cookieDomain` set, a sibling subdomain can plant or overwrite the session cookie (cookie tossing). Host-only deployments could use the `__Host-` prefix (needs `Secure` and no Domain); the one-shot state cookie could use it whenever `cookieSecure` is on.
- [ ] **Validate `auth.postLoginRedirect`.** It's operator config, so not an open redirect, but `Validate()` should require a path starting with a single `/` or an absolute http(s) URL, so a typo like `//host` doesn't become a protocol-relative redirect.
- [ ] **Add `Cache-Control: no-store` and `Referrer-Policy: no-referrer` to the login redirects.** The callback URL carries the one-time code; defence in depth.
- [ ] **Decide on session revocation.** Logout only clears the cookie: a copied JWT stays valid until `exp` (a deleted user is rejected on the next request). Document it, or add a revocation list or short-lived sessions with refresh.
