#!/bin/bash
set -e;

/bin/bash .make/utils/execute-in-docker.sh \
-d "run" \
-c "npm run tsc" \
-s "byor-voting-server" \
-o "--rm"
