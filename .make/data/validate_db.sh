#!/bin/bash
set -e;

read -e -p "Do you want to fix the errors? [y/N] " inFixErrors;
fixErrors="${inFixErrors:-N}"

read -e -p "Please enter the target MongoDB URI [mongodb://mongo/]: " inMongoUri;
mongoUri="${inMongoUri:-mongodb://mongo/}"

read -e -p "And the target MongoDB name: [byorDev]" inMongoDbName;
mongoDbName="${inMongoDbName:-byorDev}"

read -d '' final_command << EOF || true
export MONGO_URI="${mongoUri}"
export MONGO_URI_ADMIN=""
export MONGO_DB_NAME="${mongoDbName}"
export TRACE_LEVEL=${TRACE_LEVEL}
npm run validate-db ${fixErrors}
EOF

/bin/bash .make/utils/execute-in-docker.sh \
-d "run" \
-c "/bin/bash -c \"${final_command}\"" \
-s "byor-backend" \
-o "--rm"
