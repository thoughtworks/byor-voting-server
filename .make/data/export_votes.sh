#!/bin/bash
set -e;

source .make/utils/get_byor_env.sh

read -e -p "Output file name: [exported_votes.txt]" readOutputFilename;
outputFilename="${readOutputFilename:-exported_votes.txt}"

read -e -p "(Optional) voting event id: " votingEventId;

read -d '' final_command << EOF || true
export MONGO_URI="${MONGO_URI}"
export MONGO_DB_NAME="${MONGO_DB_NAME}"
npm run extract-votes "/usr/src/app/${outputFilename}" "${votingEventId}"
EOF

/bin/bash .make/utils/execute-in-docker.sh \
-d "run" \
-c "/bin/bash -c \"${final_command}\"" \
-s "byor-voting-server" \
-o "--rm"
