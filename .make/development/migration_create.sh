#!/bin/bash
set -e;

read -e -p "Please enter the new migration name: " migration;

if [ -z "${migration}" ]; then
    echo "Migration name is required"
    exit 1;
fi

if [[ ! ${migration} =~ ^[a-z0-9\-]+$ ]]; then
    echo "Migration name can contain only alphanumeric lowercase characters and hyphens"
    exit 1;
fi

/bin/bash .make/utils/execute-in-docker.sh \
-c "npm run migrate:create ${migration}" \
-s "byor-voting-server" \
-o "--exit-code-from byor-voting-server"

echo "Migration file created successfully, now you should implement the migration logic in it"
