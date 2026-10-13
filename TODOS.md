# TODOs

Things the repo references but doesn't have yet.

- [ ] **Add `CONTRIBUTING.md`.** The checklist in `.github/pull_request_template.md` links to it, so that link is broken today.
- [ ] **Change how vulnerabilities are reported.** `SECURITY.md` asks people to report vulnerabilities in public issues. Turn on GitHub private vulnerability reporting and point `SECURITY.md` to it.

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
- [ ] **Clear members before deleting a company.** `users.company_id` has no `ON DELETE` action, because `SET NULL` would leave `company_role` behind and break `users_company_role_pair`. The company delete in the repository has to set both fields to NULL on its members in the same transaction, or the delete fails.
- [ ] **Always set `audit_log.company_id`.** The audit table has no foreign keys, so `AuditScope` can't reach a deleted team's company through a join. Every entry written inside a company must carry `company_id` directly, or company admins lose it from their audit view.
- [ ] **Add a company join date if the UI shows one.** `CompanyMember.CreatedAt` can only come from `users.created_at`, so "joined" would mean "account created". Add a `company_joined_at` column when a screen needs the real date.

## Repository

Left open after the review of the DB harness and user repo.

- [ ] **Narrow `isNoRows`.** It also maps pg 22P02 (invalid input) to "not found", which is right for a malformed uuid in `GetByID` but would hide a bad cast in any other query that reuses it. Validate the uuid in `GetByID` and keep `isNoRows` to `pgx.ErrNoRows`.
- [ ] **Return `ErrNotFound` from lookups.** `GetByID`/`GetByEmail` return `(nil, nil)` when nothing matches, so every caller must nil-check the user. Change it before the first caller lands.
- [ ] **Truncate every table in the test harness.** `allTables` in `internal/testutil/postgres.go` is hard-coded; a new table without a foreign key to it keeps rows between tests. Build the `TRUNCATE` from `pg_tables` (minus `goose_db_version`). The unused `harness.terminate` field goes too, or gets called from a `TestMain` helper for runs with Ryuk disabled.
- [ ] **Use a params struct for `UpsertFromOIDC`.** Its four positional strings (email, name, avatarURL, sub) let a swapped email and sub compile. Cover `avatarURL`, `LastLoginAt` and `UpdatedAt` in the tests while there.
