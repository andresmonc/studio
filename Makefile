GOCMD=go
GOTEST=$(GOCMD) test
GOVET=$(GOCMD) vet
ALL_GO_MOD_DIRS := ./server/management

GREEN  := $(shell tput -Txterm setaf 2)
YELLOW := $(shell tput -Txterm setaf 3)
WHITE  := $(shell tput -Txterm setaf 7)
CYAN   := $(shell tput -Txterm setaf 6)
RESET  := $(shell tput -Txterm sgr0)

.PHONY: all build clean tidy vet test lint help dev dev-hosts start-api-dev start-ui-dev stop-dev stop-api-dev stop-ui-dev

all: help
## Build:
build: ## Build all the modules of the project
	@$(foreach module, $(ALL_GO_MOD_DIRS), (echo "→ Building $(module)"; cd $(module) && CGO_ENABLED=0 $(GOCMD) build ./...) &&) true

clean: ## Remove build related files
	-rm -fr ./bin
	-@$(foreach module, $(ALL_GO_MOD_DIRS), rm -f $(module)/coverage.out;)

tidy: ## Run go mod tidy for all modules of the project
	@$(foreach module, $(ALL_GO_MOD_DIRS), (echo "→ Tidying $(module)"; cd $(module) && $(GOCMD) mod tidy) &&) true

## Test:
vet: ## Run go vet on all the modules of the project
	@$(foreach module, $(ALL_GO_MOD_DIRS), (echo "→ Vetting $(module)"; cd $(module) && $(GOVET) ./...) &&) true

test: ## Run the tests of the project and export the coverage in <module>/coverage.out
	@$(foreach module, $(ALL_GO_MOD_DIRS), (echo "→ Testing $(module)"; cd $(module) && $(GOTEST) -covermode=count -coverprofile=coverage.out ./...) &&) true

## Lint:
lint: ## Use golangci-lint on all the modules of the project
	mkdir -p ./bin
	curl -sSfL https://golangci-lint.run/install.sh -o ./bin/install-golangci-lint.sh
	sh ./bin/install-golangci-lint.sh -b ./bin
	@$(foreach module, $(ALL_GO_MOD_DIRS), (echo "→ Linting $(module)"; cd $(module) && "$(CURDIR)/bin/golangci-lint" run --timeout=5m --config "$(CURDIR)/.golangci.yml" ./...) &&) true

## Dev:
dev: ## Start the API stack and the UI (Ctrl-C stops both)
	@$(MAKE) -j2 start-api-dev start-ui-dev

start-api-dev: dev-hosts ## Start Postgres + Keycloak and the API (no seed data)
	./server/management/scripts/dev.sh

start-ui-dev: dev-hosts ## Start the web UI dev server
	cd webui && pnpm install && pnpm dev -- --host goff.local

# The Keycloak realm, the API cookie and Vite only accept the goff.local host.
dev-hosts: ## Ensure goff.local is in /etc/hosts and resolves to 127.0.0.1
	@grep -Eq '^[^#]*[[:space:]]goff\.local([[:space:]]|$$)' /etc/hosts || { \
		echo "→ goff.local is missing from /etc/hosts, adding it (sudo)"; \
		echo '127.0.0.1 goff.local' | sudo tee -a /etc/hosts >/dev/null; \
	}
	@# Goes through the system resolver, so it catches a stale DNS cache or an entry for another IP.
	@ping -c 1 goff.local 2>/dev/null | grep -q '(127\.0\.0\.1)' || { \
		echo "✗ goff.local does not resolve to 127.0.0.1: check /etc/hosts, then flush the DNS cache" >&2; \
		echo "  (macOS: sudo killall -HUP mDNSResponder)" >&2; \
		exit 1; \
	}
	@echo "✓ goff.local resolves to 127.0.0.1"

stop-dev: stop-api-dev stop-ui-dev ## Stop everything started by make dev

# ponytail: stops whatever listens on the dev ports, track PIDs if that ever bites.
stop-api-dev: ## Stop the API and remove Postgres + Keycloak (wipes the DB)
	@pids=$$(lsof -ti tcp:8080 -sTCP:LISTEN); [ -z "$$pids" ] || kill $$pids
	cd server/management && docker compose down -v

stop-ui-dev: ## Stop the web UI dev server
	@pids=$$(lsof -ti tcp:5173 -sTCP:LISTEN); [ -z "$$pids" ] || kill $$pids

## Help:
help: ## Show this help.
	@echo ''
	@echo 'Usage:'
	@echo '  ${YELLOW}make${RESET} ${GREEN}<target>${RESET}'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} { \
		if (/^[a-zA-Z_-]+:.*?##.*$$/) {printf "    ${YELLOW}%-20s${GREEN}%s${RESET}\n", $$1, $$2} \
		else if (/^## .*$$/) {printf "  ${CYAN}%s${RESET}\n", substr($$1,4)} \
		}' $(MAKEFILE_LIST)
