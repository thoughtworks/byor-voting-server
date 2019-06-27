SHELL:=/bin/bash
.DEFAULT_GOAL:=help

##@ Building

.PHONY: install

install: ## Pulls and builds the necessary docker images and then runs npm install from within the container `byor-voting-server`
		@/bin/bash .make/ci/install.sh

##@ CI

.PHONY: lint tsc unit_tests integration_tests ci_all

lint: ## Runs lint checks on TS files
		@/bin/bash .make/ci/lint.sh

tsc: ## Runs TSC on TS files
		@/bin/bash .make/ci/tsc.sh

unit_tests: ## Runs unit tests
		@export test_script="test"; /bin/bash .make/ci/tests.sh

integration_tests: ## Runs integration tests against dedicated mongodb
		@export test_script="test:integration"; /bin/bash .make/ci/tests.sh

ci_all: ## Runs all the following tasks in sequence: install, lint, tsc, unit tests, integration tests
		@/bin/bash .make/ci/all.sh

##@ CD

.PHONY: deploy semantic_release

deploy: ## Deploys on AWS infrastructure via Serverless framework
		@/bin/bash .make/cd/deploy_aws.sh

semantic_release: ## Updates version based on commit messages, commits release notes and pushes release tags
		@/bin/bash .make/cd/semantic_release.sh

##@ Development

.PHONY: check_for_secrets execute_command migration_create dev_server_start dev_server_stop dev_clean_up test_single

check_for_secrets: ## Scan local project files looking for dangerous secrets (this is also run as pre-commit hook)
		@/bin/bash .make/development/check_for_secrets.sh

execute_command: ## Executes an arbitrary command inside the application's container
		@/bin/bash .make/development/execute_command.sh

migration_create: ## Intializes a new mongodb migration script
		@/bin/bash .make/development/migration_create.sh

dev_server_start: ## Starts the local dev server
		@/bin/bash .make/development/start.sh

dev_server_stop: ## Stops the local dev server
		@/bin/bash .make/development/stop.sh

dev_clean_up: ## Cleans up the local application and its persistent data
		@/bin/bash .make/development/cleanup_local_data.sh

test_single: ## Runs a single test file (for debug purposes)
		@/bin/bash .make/development/test_single.sh

##@ Data management

.PHONY: import_technologies export_votes count_voters cancel_voting_event

import_technologies_from_gsheet: ## Imports technologies from public Google Sheet
		@/bin/bash .make/data/import_technologies_from_gsheet.sh

import_technologies_from_csv: ## Imports technologies from csv file
		@/bin/bash .make/data/import_technologies_from_csv.sh

export_votes: ## Exports votes to file
		@/bin/bash .make/data/export_votes.sh

count_voters: ## Logs the count of voters (by voting event id or for all voting events)
		@/bin/bash .make/data/count_voters.sh

cancel_voting_event: ## Deletes (soft or hard) a voting event
		@/bin/bash .make/data/cancel_voting_event.sh

dump_db: ## export the whole db to dump folder
		@/bin/bash .make/data/dump_db.sh

restore_db: ## restore db from dump folder
		@/bin/bash .make/data/restore_db.sh

validate_db: ## restore db from dump folder
		@/bin/bash .make/data/validate_db.sh		

##@ Administration

.PHONY: set_admin_user_and_pwd

set_admin_user_and_pwd: ## Reset admin username and password
		@/bin/bash .make/admin/set_admin_user_and_pwd.sh

##@ Helpers

.PHONY: help

help:  ## Display this help
		@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
