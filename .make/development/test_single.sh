#!/bin/bash
set -e;

if [[ ! "${TEST_FILE_PATH}" == *.spec.ts ]]; then
    echo "Current file \"${TEST_FILE_PATH}\" has no suffix .spec.ts, please open a test file in the current editor. Aborting..."
    exit 1;
fi

read -d '' final_command << EOF || true
export TRACE_LEVEL=${TRACE_LEVEL}
npm run test:single -- .make/utils/wait_before_tests.ts ${TEST_FILE_PATH}
EOF

/bin/bash .make/utils/execute-in-docker.sh \
        -d "run" \
        -c "/bin/bash -c \"${final_command}\"" \
        -f "docker-compose.integration-tests.yml" \
        -s "byor-backend" \
        -o "--rm --publish 9228:9228"
