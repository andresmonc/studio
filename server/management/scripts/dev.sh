#!/usr/bin/env bash
# Launch the GO Feature Flag Management API for local development.
#
# Steps:
#   1. Load environment variables from .env (or .env.example)
#   2. Start Docker infrastructure (compose.yaml: Postgres + Keycloak)
#   3. Wait for Postgres and Keycloak to be reachable
#   4. Run the API via `go run` (it applies the schema migrations at startup)
#
# Flags:
#   --no-infra        skip "docker compose up -d"
#   --no-migrate      start without applying migrations (GOFF_MGMT_DB_MIGRATE=false)
#   --rebuild-infra   docker compose down -v before bringing infra up
#   --build           build a binary to ./out/management instead of `go run`
#
# Requires: docker, curl, go.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${SERVICE_DIR}"

# --- options ---
RUN_INFRA=1
RUN_MIGRATE=1
REBUILD_INFRA=0
BUILD_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --no-infra)      RUN_INFRA=0 ;;
    --no-migrate)    RUN_MIGRATE=0 ;;
    --rebuild-infra) REBUILD_INFRA=1 ;;
    --build)         BUILD_ONLY=1 ;;
    -h|--help)
      sed -n '2,16s/^# \{0,1\}//p' "${SCRIPT_DIR}/dev.sh"
      exit 0
      ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# --- env ---
ENV_FILE=""
if [ -f "${SERVICE_DIR}/.env" ]; then
  ENV_FILE="${SERVICE_DIR}/.env"
elif [ -f "${SERVICE_DIR}/.env.example" ]; then
  ENV_FILE="${SERVICE_DIR}/.env.example"
  echo "==> Using .env.example (copy to .env to customize)"
fi
if [ -n "${ENV_FILE}" ]; then
  echo "==> Loading env from ${ENV_FILE}"
  # The caller's GOFF_MGMT_* variables win over the file.
  caller_env=$(export -p | grep ' GOFF_MGMT_' || true)
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
  eval "${caller_env}"
fi

: "${GOFF_MGMT_DB_URL:=postgres://goff:goff@localhost:5432/goff_mgmt?sslmode=disable}"
export GOFF_MGMT_DB_URL

# --- tool checks ---
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing required tool: $1" >&2; exit 1; }; }
need go
[ "$RUN_INFRA" = "1" ] && need docker && need curl

# --- infra ---
if [ "$RUN_INFRA" = "1" ]; then
  if [ "$REBUILD_INFRA" = "1" ]; then
    echo "==> Rebuilding docker infra (down -v)"
    docker compose down -v
  fi
  echo "==> Starting docker infra (postgres + keycloak)"
  docker compose up -d
fi

# --- wait for infra ---
# Only for the compose services: with --no-infra the database is the caller's,
# and the API reports clearly when it is unreachable.
wait_for() { # name, seconds, command...
  local name=$1 secs=$2; shift 2
  echo "==> Waiting for ${name}"
  for ((i = 1; i <= secs; i++)); do
    if "$@" >/dev/null 2>&1; then echo "    ${name} is up"; return; fi
    sleep 1
  done
  echo "    ${name} not reachable after ${secs}s" >&2
  exit 1
}
if [ "$RUN_INFRA" = "1" ]; then
  # Over TCP: the image's init-time server only listens on the unix socket.
  wait_for Postgres 60 docker compose exec -T postgres pg_isready -h 127.0.0.1 -U goff -d goff_mgmt
  # The API fetches the OIDC discovery document at startup and exits without it.
  wait_for Keycloak 120 curl -fsS "${GOFF_MGMT_OIDC_ISSUER:?set in .env}/.well-known/openid-configuration"
fi

# --- migrations ---
# The API applies them at startup; --no-migrate turns that off.
if [ "$RUN_MIGRATE" = "0" ]; then
  export GOFF_MGMT_DB_MIGRATE=false
fi

# --- run ---
echo "==> Starting API on :${GOFF_MGMT_SERVER_PORT:-8080}"
echo "    Swagger:  http://goff.local:${GOFF_MGMT_SERVER_PORT:-8080}/swagger/index.html"
echo "    Login:    http://goff.local:${GOFF_MGMT_SERVER_PORT:-8080}/auth/login"
echo

if [ "$BUILD_ONLY" = "1" ]; then
  mkdir -p out
  go build -o out/management .
  exec ./out/management
fi

exec go run .
