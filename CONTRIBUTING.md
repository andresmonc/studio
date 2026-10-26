# Contributing to GO Feature Flag Studio

Thanks for helping! Studio is still under active development, so APIs and the data model can
change freely; open an issue first for anything large, so we can agree on the approach.

To report a vulnerability, don't open an issue: follow [SECURITY.md](SECURITY.md).

## Set up

You need:

- Go, at the version in `server/management/go.mod`,
- Docker (for the local Postgres and Keycloak, and for the database tests),
- Node and pnpm (for the web UI),
- `make`.

Start everything locally, from the repository root:

```sh
make dev            # API stack + web UI (Ctrl-C stops both)
make start-api-dev  # Postgres 18 + Keycloak, then the API on http://goff.local:8080
make start-ui-dev   # web UI on http://goff.local:5173
make stop-dev       # stop both and remove the containers (wipes the database)
```

`make stop-api-dev` and `make stop-ui-dev` stop one side only.

The dev Keycloak realm only accepts `goff.local` redirects, so the start targets add
`127.0.0.1 goff.local` to `/etc/hosts` when it is missing (it asks for your sudo password once).
Log in at `http://goff.local:8080/auth/login` with `admin@local` / `admin` (a super admin) or
`user@local` / `user`. `server/management/scripts/dev.sh --help` lists the API options, and
`server/management/.env.example` the settings it uses.

## Build, test, lint

From the repository root:

```sh
make build   # build every Go module
make vet
make test    # writes <module>/coverage.out
make lint    # golangci-lint, with the formatters (gci, gofmt, goimports)
```

CI runs all four; a pull request needs them green. Database tests start a throwaway Postgres
with testcontainers. Without Docker they are **skipped**, not failed, so check the output for
`SKIP` before trusting a local run.

## Conventions

The full list is in [AGENTS.md](AGENTS.md); the essentials:

- **Tests ship with every change** (Codecov asks for 80% patch coverage). Prefer table-driven
  tests with `testify/assert`, assert the specific field or message, and use Go fuzzing for
  functions that take free-form input (parsers, validators).
- **Validation reports every problem at once**, naming the field
  (`server.port must be between 1 and 65535`).
- **Reuse the GO Feature Flag core** for flag semantics instead of re-implementing them.
- **Comments explain why**, not what the code does.
- **Fix lint findings** rather than adding `//nolint`, unless you give the reason.
- Out-of-scope problems you find go in [TODOS.md](TODOS.md), under the right priority.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org), scoped by area:
  `feat(server): …`, `fix(server): …`, `test(server): …`, `docs: …`, `chore: …`. PR titles are
  checked for it.
- Keep the commit body a short list of what changed and why.
- Fill in the pull request template: what and why, how to test, and the issue it closes.
