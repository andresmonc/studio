# TODOs

Things the repo references but doesn't have yet.

- [ ] **Add `CONTRIBUTING.md`.** The checklist in `.github/pull_request_template.md` links to it, so that link is broken today.
- [ ] **Add the bug issue template `.github/ISSUE_TEMPLATE/bug.md`.** The "open security issue" link in `SECURITY.md` uses `template=bug.md`, which doesn't exist.
- [ ] **Change how vulnerabilities are reported.** `SECURITY.md` asks people to report vulnerabilities in public issues. Turn on GitHub private vulnerability reporting and point `SECURITY.md` to it.

## Config loader

Found while reviewing `server/management/config`, all three still open after `Config.Validate()` (#11).

- [ ] **Ignore `GOFF_MGMT_*` env vars that are set to an empty string.** koanf's env provider loads them and `WeaklyTypedInput` coerces `""` to the zero value, so an empty var silently replaces the default: `GOFF_MGMT_AUTH_COOKIESECURE=` drops the `Secure` flag from session cookies and `GOFF_MGMT_DB_MAXCONNS=` gives a 0-connection pool. Easy to hit with Compose `VAR=${UNSET}` or `docker run -e VAR`. `env.ProviderWithValue` passes the value to the callback, which can then return an empty key to skip the var.
- [ ] **Trim comma-separated env lists.** `StringToSliceHookFunc(",")` keeps surrounding spaces, so `GOFF_MGMT_AUTH_ADMINEMAILS="a@x, b@x"` decodes to `["a@x", " b@x"]` and the second address never matches a login email. Same for `GOFF_MGMT_OIDC_SCOPES`, where `" email"` would be sent to the IdP.
- [ ] **Document that durations need a unit.** `shutdownTimeout: 30` in YAML means 30 nanoseconds, not 30 seconds, because mapstructure assigns a bare number straight onto `time.Duration`. Spell the units out in the config reference, or reject sub-millisecond durations in `Validate()`.
