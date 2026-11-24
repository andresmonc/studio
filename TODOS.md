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

- [ ] **[Auth] Return a 4xx with a reason when the OIDC subject changed.** When an email is already bound to a different `oidc_sub`, `UpsertFromOIDC` returns `ErrIdentityMismatch`. The callback (`handler/auth.go`) only maps `ErrLoginRejected` to 400, so the user gets a 500 `{"message":"login failed"}` with nothing to act on. That happens in dev whenever the Keycloak container is recreated against an existing database. Map `ErrIdentityMismatch` to a 403 with a message saying the account is linked to another identity.

- [ ] **[WebUI] Keep delete/remove dialogs open until the request finishes.** The confirm button in `ConfirmDeleteDialog` (`src/components/`) and the remove dialogs in `pages/company/members.tsx`, `teams.tsx` and `team-members-card.tsx` is a Radix `AlertDialogAction`, which closes the dialog on click. The "Deleting…/Removing…" state never shows, and on an API error the dialog is already gone (the flagset delete makes the user retype the name). Call `e.preventDefault()` in the confirm handler and close on success; the current tests assert today's behaviour and need updating with the fix.
- [ ] **[WebUI] Fix the dialog/button a11y warnings seen in tests.** `flag-detail-history-tab.tsx` nests the Revert `<Button>` inside the row's `<button>` (invalid HTML, React warns); make the row a `div role="button"` or move Revert out. `flag-wizard.tsx` has no `DialogTitle` (wrap the "New flag" heading) and the "Generate API key" dialog in `settings-api-keys-tab.tsx` has no `DialogDescription`; Radix warns about both.

- [ ] **[WebUI] Fix the unused query-builder editors before a field needs them.** In `components/react-querybuilder-shadcn-ui/`: the radio branch of `ShadcnUiValueEditor.tsx` renders `<Label>Default</Label>` for every option instead of `v.label`, and uses `id={v.name}` (duplicate ids across rules); `ShadcnUiValueSelector` with `multiple` only reads a comma-separated string but writes back `MultiSelect`'s `string[]`, so after the first toggle the selection is lost (join on the way out or accept arrays on the way in); and it never passes `disabled` to `MultiSelect`, which has no such prop, so read-only rules stay editable. No field uses radio or multiselect today; the tests record the current behaviour.

## P3 — Nice to have or blocked

- [ ] **[Server] Feed the parts of the home dashboard the API can't serve yet.** `webui/src/pages/home/` ships a frontend-only v1 that leaves out several things from the design:
  - **Summary endpoint.** Totals and stale counts come from the first 200 flags (`?pageSize=200`), so they are wrong for bigger teams. Each running rollout also costs one `GET /flags/:id` to read its dates. Add `GET /teams/:id/dashboard` returning counts, the rollout windows and the number of distinct actors over 7 days (the "by N people" line).
  - **Stale flags.** The 30-day rule needs a "distribution last changed" timestamp, because `updatedAt` also moves on enable/disable.
  - **Missing concepts.** There is no data at all for:
    - retriever sync status per flagset ("Synced / Retrying")
    - evaluation telemetry ("no evaluations in 14 days")
    - pausing a rollout

- [ ] **[Notifiers] Send a test message from the notifier dialog.** The design has a "Send test message" button, left out because it needs `POST /flagsets/:id/notifiers/test` making outbound requests from Studio to user-given URLs. Add it with SSRF guards (block private and link-local addresses, short timeout, no redirects) and reuse the relay proxy's payload shape.
- [ ] **[Roles] Rename `User.Role()`.** It returns a `CompanyRole`, while `Role` is also the name of the team role type, so callers can mix the two up. Something like `CompanyRoleOrEmpty()` is clearer.
- [ ] **[Roles] Fill two test gaps.** No `AtLeast` test checks that an unknown role (e.g. `Role("owner").AtLeast(RoleViewer)`) is denied, for team or company roles. `TestNewMeResponse` doesn't cover a user with `CompanyID` set but `CompanyRole` nil, which would return `company.role: ""`; the `users_company_role_pair` CHECK rules that state out in the DB, but the Go side has no test for it.
- [ ] **[Handlers] Make the `params` test helper reject an odd argument count.** A trailing key without a value is dropped silently, so a test can pass with an empty path param.
- [ ] **[Flag evaluation] Guard against a nil request.** `EvaluateFlag` reads `req.EvaluationContext` without a nil check, so a nil `*EvaluateFlagRequest` panics. The only caller always passes a request today; add a check (or take the struct by value) if another caller shows up.
- [ ] **[Flag evaluation] Test a percentage rule with no targeting key.** It only exercises the core engine's behaviour, not code in this package.
- [ ] **[Dev scripts] Stop pinning the dev port to 8080.** `.env.example`'s `GOFF_MGMT_OIDC_REDIRECTURL` assumes `goff.local:8080`, so `GOFF_MGMT_SERVER_PORT=9000` breaks the login callback. Derive the redirect URL from the port in `dev.sh` if other ports are needed (the Keycloak realm already accepts any port).
- [ ] **[Database] Add a company join date if the UI shows one.** `CompanyMember.CreatedAt` can only come from `users.created_at`, so "joined" would mean "account created". Add a `company_joined_at` column when a screen needs the real date.
- [ ] **[Repo] Update `AGENTS.md` once Studio has a working version.** It still describes a work in progress: `webui/` is listed as "not created yet" and it says no backward-compat shims are needed. When the API and UI ship, refresh the layout, commands and compatibility rules.
- [ ] **[WebUI] Work around cmdk's combobox ARIA.** cmdk's input always sets `aria-expanded="true"` and points `aria-controls` at its list, overriding our props (`home/index.tsx` and `tag-input.tsx` keep an empty hidden list mounted for that). When a search matches nothing, the tag filter, member picker and query-builder field selector show an empty `role="listbox"`, which axe rejects (no story covers that state). Fix upstream or render the "no match" text outside the list.
