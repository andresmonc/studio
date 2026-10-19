# TODOs

Known follow-ups, most important first. Each item is tagged with the area it touches.

- **P0** — security holes and deploy blockers.
- **P1** — correctness bugs users will hit.
- **P2** — hardening, hygiene and decisions with a safe workaround.
- **P3** — nice to have, or blocked on something else.

## P0 — Security holes and deploy blockers

_Nothing open._

## P1 — Correctness bugs

_Nothing open._

## P2 — Hardening and hygiene

_Nothing open._

## P3 — Nice to have or blocked

- [ ] **[Roles] Rename `User.Role()`.** It returns a `CompanyRole`, while `Role` is also the name of the team role type, so callers can mix the two up. Something like `CompanyRoleOrEmpty()` is clearer.
- [ ] **[Roles] Fill two test gaps.** No `AtLeast` test checks that an unknown role (e.g. `Role("owner").AtLeast(RoleViewer)`) is denied, for team or company roles. `TestNewMeResponse` doesn't cover a user with `CompanyID` set but `CompanyRole` nil, which would return `company.role: ""`; the `users_company_role_pair` CHECK rules that state out in the DB, but the Go side has no test for it.
- [ ] **[Handlers] Make the `params` test helper reject an odd argument count.** A trailing key without a value is dropped silently, so a test can pass with an empty path param.
- [ ] **[Flag evaluation] Guard against a nil request.** `EvaluateFlag` reads `req.EvaluationContext` without a nil check, so a nil `*EvaluateFlagRequest` panics. The only caller always passes a request today; add a check (or take the struct by value) if another caller shows up.
- [ ] **[Flag evaluation] Test a percentage rule with no targeting key.** It only exercises the core engine's behaviour, not code in this package.
- [ ] **[Dev scripts] Stop pinning the dev port to 8080.** `.env.example`'s `GOFF_MGMT_OIDC_REDIRECTURL` assumes `goff.local:8080`, so `GOFF_MGMT_SERVER_PORT=9000` breaks the login callback. Derive the redirect URL from the port in `dev.sh` if other ports are needed (the Keycloak realm already accepts any port).
- [ ] **[Database] Add a company join date if the UI shows one.** `CompanyMember.CreatedAt` can only come from `users.created_at`, so "joined" would mean "account created". Add a `company_joined_at` column when a screen needs the real date.
- [ ] **[Repo] Update `AGENTS.md` once Studio has a working version.** It still describes a work in progress: `webui/` is listed as "not created yet" and it says no backward-compat shims are needed. When the API and UI ship, refresh the layout, commands and compatibility rules.
