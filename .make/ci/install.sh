#!/bin/bash
set -e;

/bin/bash .make/utils/execute-in-docker.sh \
-c "npm install" \
-s "byor-voting-server" \
-o "--build --exit-code-from byor-voting-server"
