#!/bin/bash
set -e;

read -d '' final_command << EOF || true
export TRACE_LEVEL=${TRACE_LEVEL}
npm run dev-server:start
EOF

/bin/bash .make/utils/execute-in-docker.sh \
-c "/bin/bash -c \"${final_command}\"" \
-f "docker-compose.local-dev.yml" \
-o "--exit-code-from byor-backend"
