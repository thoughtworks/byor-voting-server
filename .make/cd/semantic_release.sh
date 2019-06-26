#!/bin/bash
set -e;

if [ -z "${CI}" ]; then
    echo "Aborting since this command should be executed from CI/CD pipelines only"
    exit 1;
fi

/bin/bash .make/utils/execute-in-docker.sh \
-c "npm run semantic-release" \
-s "byor-backend" \
-o "--exit-code-from byor-backend"
