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
- [ ] **Fill two test gaps.** No `AtLeast` test checks that an unknown role (e.g. `Role("owner").AtLeast(RoleViewer)`) is denied. `TestNewMeResponse` doesn't cover a user with `CompanyID` set but `CompanyRole` nil, which would return `company.role: ""`; the comment on `User` says that state can't happen, but nothing enforces it.
- [ ] **Rename `User.Role()`.** It returns a `CompanyRole`, while `Role` is also the name of the team role type, so callers can mix the two up. Something like `CompanyRoleOrEmpty()` is clearer.
