#!/bin/bash
set -e;

source .make/utils/get_byor_env.sh

read -e -p "Voting event id: " votingEventId;
if [ -z "${votingEventId}" ]; then
    echo "Voting event id is required"
    exit 1;
fi

read -e -p "Hard delete? [y/N] " inCancelHard;
if [[ ${inCancelHard} == y ]]; then
    cancelHard="H"
fi

read -d '' final_command << EOF || true
export MONGO_URI="${MONGO_URI}"
export MONGO_DB_NAME="${MONGO_DB_NAME}"
npm run cancel-voting-event "${votingEventId}" "${cancelHard}"
EOF

/bin/bash .make/utils/execute-in-docker.sh \
-d "run" \
-c "/bin/bash -c \"${final_command}\"" \
-s "byor-voting-server" \
-o "--rm"
