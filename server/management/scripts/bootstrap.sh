#!/usr/bin/env bash
# Wait for the database and apply migrations.
# Requires: psql, goose.
set -euo pipefail

for tool in psql goose; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool" >&2; exit 1; }
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

: "${GOFF_MGMT_DB_URL:=postgres://goff:goff@localhost:5432/goff_mgmt?sslmode=disable}"

echo "==> Waiting for PostgreSQL"
for i in {1..30}; do
  if psql "${GOFF_MGMT_DB_URL}" -c 'SELECT 1' >/dev/null 2>&1; then
    echo "    postgres is up"
    break
  fi
  sleep 1
  if [ "$i" = "30" ]; then
    echo "    postgres not reachable after 30s" >&2
    exit 1
  fi
done

echo "==> Applying goose migrations"
cd "${SERVICE_DIR}"
goose -dir ./db/migrations postgres "${GOFF_MGMT_DB_URL}" up

echo "==> Done."
