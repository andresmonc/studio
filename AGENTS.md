# AGENTS.md

GO Feature Flag Studio: the web UI + management API for [GO Feature Flag](https://gofeatureflag.org).
Work in progress; APIs and data model can change freely, no backward-compat shims needed yet.

## Layout
- `server/management/` — Go module for the management API (`config/`, `model/`, `telemetry/`).
- `webui/` — planned frontend (Vite/React), not created yet.
- `TODOS.md` — known follow-ups, grouped by area.

## Commands (run from repo root)
- `make build` · `make vet` · `make test` (writes `<module>/coverage.out`) · `make lint` · `make tidy`
- New Go module → add it to `ALL_GO_MOD_DIRS` in the `Makefile`.
- CI (`.github/workflows/server.yml`) runs vet, build, test, lint; all must pass.

## Go conventions
- Go version comes from `server/management/go.mod`; prefer stdlib (`slices`, `maps`, `errors.Join`) over helpers.
- Lint config is `.golangci.yml`: funlen 90 lines / 50 statements, `lll`, `gocognit`, `gocyclo`, `gosec`, `revive`.
  Formatters: `gci`, `gofmt`, `goimports`. Fix lint findings, don't `//nolint` them without a reason.
- Reuse GO Feature Flag core (`github.com/thomaspoignant/go-feature-flag/modules/core`) for flag semantics
  instead of re-implementing them; document any rule where Studio is stricter than GOFF.
- Validation returns every problem at once (`errors.Join`), with messages naming the field
  (e.g. `server.port must be between 1 and 65535`).
- Config is loaded with koanf; env vars use the `GOFF_MGMT_` prefix.
- JSON tags are camelCase; DB tags are snake_case.
- Comments explain *why* or a non-obvious invariant; no comments restating code.

## Tests
- Every change ships with tests; Codecov requires 80% patch coverage.
- Test file next to the code (`foo.go` → `foo_test.go`), assertions with `testify/assert`.
- Default to table-driven tests: a `tests := []struct{ name string; ...; wantErr bool }` slice looped with
  `t.Run(tt.name, ...)`. Add a case to the table rather than writing a new test function.
- Use Go native fuzzing (`func FuzzXxx(f *testing.F)`) when a function takes untrusted or free-form input:
  parsers, validators, name/query checks, JSON payload decoding. Seed the corpus with the table cases
  (`f.Add(...)`), and assert invariants (no panic, valid input round-trips, rejected input returns an error).
  Commit any failing input found under `testdata/fuzz/` as a regression case. Run locally with
  `go test -fuzz=FuzzXxx -fuzztime=30s ./<pkg>`; `make test` replays the seed corpus only.
- Assert the specific failing field/message, not just `err != nil`.
- Delete unreachable error paths rather than writing contrived tests for them.

## Commits & PRs
- Conventional Commits, scoped by area: `feat(server): …`, `fix(server): …`, `test(server): …`, `docs: …`, `chore: …`.
  PR titles are linted for this.
- Commit body: short bullet list of what changed and why.
- Fill `.github/pull_request_template.md` (what & why, how to test, linked issue).

## Follow-ups
- Issues found but out of scope go in `TODOS.md` under the relevant section, with the concrete failure
  and the suggested fix. Remove the entry when it's resolved.
