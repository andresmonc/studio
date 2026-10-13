# Local dev Makefile for the GO Feature Flag Management API.
# Run from server/ (or any cwd — paths are absolute via MAKEFILE_LIST).

SHELL := /bin/bash
.DEFAULT_GOAL := help

# --- path roots (work from any cwd) ------------------------------------------
SERVER_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
MGMT_DIR   := $(SERVER_DIR)management/
COMPOSE    := docker compose -f $(MGMT_DIR)docker-compose.yml
MIGRATIONS := $(MGMT_DIR)db/migrations
SEED_SQL   := $(MGMT_DIR)scripts/seed.sql

# --- config -------------------------------------------------------------------
# DB_NAME isolates each Conductor workspace inside the shared Postgres. Override
# it (e.g. DB_NAME=goff_mgmt_casablanca) and GOFF_MGMT_DB_URL follows along.
DB_NAME ?= goff_mgmt
GOFF_MGMT_DB_URL ?= postgres://goff:goff@localhost:5432/$(DB_NAME)?sslmode=disable
KEYCLOAK_OIDC_URL ?= http://localhost:8081/realms/goff/.well-known/openid-configuration
# swag CLI pinned to the library version in management/go.mod (recursive `=`: only resolved by `swagger`).
SWAG_VERSION = $(shell cd $(MGMT_DIR) && go list -m -f '{{.Version}}' github.com/swaggo/swag)
ENV_FILE := $(if $(wildcard $(MGMT_DIR).env),$(MGMT_DIR).env,$(if $(wildcard $(MGMT_DIR).env.example),$(MGMT_DIR).env.example,))

.PHONY: help start-api stop-api restart-api status logs \
        infra-up infra-down infra-restart \
        wait-postgres wait-keycloak create-db \
        migrate-up migrate-down migrate-reset migrate-status \
        seed dump-seed \
        run build test coverage swagger changelog clean

help: ## Show this help.
	@awk 'BEGIN {FS = ":.*##"; printf "Targets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# --- dev lifecycle ------------------------------------------------------------

start-api: infra-up wait-postgres wait-keycloak create-db migrate-up run ## Bring infra up, create DB, migrate, seed, then run the API.

start-api-dev: infra-up wait-postgres wait-keycloak create-db migrate-up seed run ## Bring infra up, create DB, migrate, seed, then run the API.

stop-api: infra-down ## Stop docker infra.

restart-api: stop-api start-api ## Stop + start.

status: ## Show docker compose status.
	$(COMPOSE) ps

logs: ## Tail docker logs (Ctrl-C to exit).
	$(COMPOSE) logs -f

# --- infra --------------------------------------------------------------------

infra-up: ## docker compose up -d (postgres + keycloak + otel-lgtm).
	$(COMPOSE) up -d

infra-down: ## docker compose down -v (wipes volumes).
	$(COMPOSE) down -v

infra-restart: infra-down infra-up ## Recreate infra from scratch.

wait-postgres: ## Block until postgres accepts connections.
	@echo "==> Waiting for postgres"
	@for i in $$(seq 1 60); do \
		if $(COMPOSE) exec -T postgres pg_isready -U goff -d goff_mgmt >/dev/null 2>&1; then \
			echo "    postgres is up"; exit 0; \
		fi; \
		sleep 1; \
	done; \
	echo "    postgres not reachable after 60s" >&2; exit 1

wait-keycloak: ## Block until Keycloak OIDC discovery responds 200.
	@echo "==> Waiting for keycloak ($(KEYCLOAK_OIDC_URL))"
	@for i in $$(seq 1 120); do \
		code=$$(curl -s -o /dev/null -w '%{http_code}' "$(KEYCLOAK_OIDC_URL)" || true); \
		if [ "$$code" = "200" ]; then \
			echo "    keycloak is up"; exit 0; \
		fi; \
		sleep 1; \
	done; \
	echo "    keycloak OIDC discovery not reachable after 120s" >&2; exit 1

create-db: ## Create database $(DB_NAME) in the shared Postgres if it does not exist.
	@if $(COMPOSE) exec -T postgres psql -U goff -d goff_mgmt -tAc \
		"SELECT 1 FROM pg_database WHERE datname='$(DB_NAME)'" | grep -q 1; then \
		echo "==> Database $(DB_NAME) already exists"; \
	else \
		echo "==> Creating database $(DB_NAME)"; \
		$(COMPOSE) exec -T postgres psql -U goff -d goff_mgmt -c "CREATE DATABASE \"$(DB_NAME)\"" ; \
	fi

# --- migrations ---------------------------------------------------------------

migrate-up: ## Apply all goose migrations.
	goose -dir $(MIGRATIONS) postgres "$(GOFF_MGMT_DB_URL)" up

migrate-down: ## Roll back the most recent migration.
	goose -dir $(MIGRATIONS) postgres "$(GOFF_MGMT_DB_URL)" down

migrate-reset: ## Roll back all migrations.
	goose -dir $(MIGRATIONS) postgres "$(GOFF_MGMT_DB_URL)" reset

migrate-status: ## Show migration status.
	goose -dir $(MIGRATIONS) postgres "$(GOFF_MGMT_DB_URL)" status

# --- seed ---------------------------------------------------------------------

seed: ## Load scripts/seed.sql into the dev DB (set GOFF_MGMT_SEED=0 to skip).
	@if [ -f $(SEED_SQL) ] && [ "$${GOFF_MGMT_SEED:-1}" = "1" ]; then \
		echo "==> Seeding $(SEED_SQL) into $(DB_NAME)"; \
		$(COMPOSE) exec -T postgres psql -U goff -d $(DB_NAME) -v ON_ERROR_STOP=1 < $(SEED_SQL); \
	else \
		echo "==> Skipping seed"; \
	fi

dump-seed: ## Snapshot current DB data into scripts/seed.sql.
	@echo "==> Dumping DB data to $(SEED_SQL)"
	@{ \
	  echo "-- AUTO-GENERATED dev seed snapshot. Regenerate with: make dump-seed"; \
	  echo "-- Loads current dev data after migrations. Idempotent (truncate+insert)."; \
	  echo "BEGIN;"; \
	  echo "SET session_replication_role = replica;"; \
	  echo "TRUNCATE audit_log, flag_versions, flags, flagsets, team_members, teams, users, companies RESTART IDENTITY CASCADE;"; \
	  $(COMPOSE) exec -T postgres pg_dump -U goff -d goff_mgmt \
	    --data-only --column-inserts --no-owner \
	    --exclude-table=goose_db_version --exclude-table=goose_db_version_id_seq; \
	  echo "UPDATE users SET oidc_sub = NULL;"; \
	  echo "SET session_replication_role = origin;"; \
	  echo "COMMIT;"; \
	} > $(SEED_SQL)
	@echo "    wrote $(SEED_SQL)"

# --- app ----------------------------------------------------------------------

run: ## Run the API (loads .env first if present).
	@if [ -n "$(ENV_FILE)" ]; then \
		echo "==> Loading $(ENV_FILE) and running API"; \
		set -a && source $(ENV_FILE) && set +a && cd $(MGMT_DIR) && go run .; \
	else \
		cd $(MGMT_DIR) && go run .; \
	fi

build: ## Build binary into ./out/management.
	mkdir -p $(SERVER_DIR)out
	cd $(MGMT_DIR) && CGO_ENABLED=0 go build -o $(SERVER_DIR)out/management .

test: ## Run unit tests.
	cd $(MGMT_DIR) && go test ./...

coverage: ## Run unit tests and write the coverage profile to management/coverage.out.
	cd $(MGMT_DIR) && go test -covermode=count -coverprofile=coverage.out ./...

swagger: ## Regenerate Swagger docs (swag pinned to the go.mod version; no install needed).
	cd $(MGMT_DIR) && go run github.com/swaggo/swag/cmd/swag@$(SWAG_VERSION) init -g ./main.go -o ./docs

changelog: ## Regenerate CHANGELOG.md from conventional commits (requires `git-cliff`).
	git cliff --include-path 'server/**' -o $(MGMT_DIR)CHANGELOG.md

clean: ## Remove build artifacts (keeps the committed Swagger docs package).
	rm -rf $(SERVER_DIR)out
