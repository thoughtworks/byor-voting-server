#!/bin/bash
set -e;

read -e -p "Please enter the target MongoDB URI: " mongoUri;
read -e -p "And the target MongoDB name: " mongoDbName;

read -e -p "(Optional) voting event id: " votingEventId;

read -d '' final_command << EOF || true
export MONGO_URI="${mongoUri}"
export MONGO_URI_ADMIN=""
export MONGO_DB_NAME="${mongoDbName}"
npm run count-voters "${votingEventId}"
EOF

/bin/bash .make/utils/execute-in-docker.sh \
-d "run" \
-c "/bin/bash -c \"${final_command}\"" \
-s "byor-backend" \
-o "--rm"
