GOCMD=go
GOTEST=$(GOCMD) test
GOVET=$(GOCMD) vet
ALL_GO_MOD_DIRS := ./server/management

GREEN  := $(shell tput -Txterm setaf 2)
YELLOW := $(shell tput -Txterm setaf 3)
WHITE  := $(shell tput -Txterm setaf 7)
CYAN   := $(shell tput -Txterm setaf 6)
RESET  := $(shell tput -Txterm sgr0)

.PHONY: all build clean tidy vet test lint help

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
