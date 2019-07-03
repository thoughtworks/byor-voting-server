#!/bin/bash
set -e;

read -e -p "Do you want to fix the errors? [y/N] " inFixErrors;
fixErrors="${inFixErrors:-N}"

source .make/utils/get_byor_env.sh

read -d '' final_command << EOF || true
export MONGO_URI="${MONGO_URI}"
export MONGO_DB_NAME="${MONGO_DB_NAME}"
export TRACE_LEVEL=${TRACE_LEVEL}
npm run validate-db ${fixErrors}
EOF

/bin/bash .make/utils/execute-in-docker.sh \
-d "run" \
-c "/bin/bash -c \"${final_command}\"" \
-s "byor-voting-server" \
-o "--rm"
