#!/bin/bash
set -e;

read -e -p "This will override all the existing technologies in the target database... are you sure to continue? [y/N] " response;
if [[ ! ${response} == y ]]; then
    echo "Aborting on user choice"
    exit 1;
fi

source .make/utils/get_byor_env.sh

read -e -p "Spreadsheet id: " spreadsheetId;
if [ -z "${spreadsheetId}" ]; then
    echo "Spreadsheet id is required"
    exit 1;
fi

read -e -p "Sheet number [1]: " inSheetNumber;
sheetNumber="${inSheetNumber:-1}"

read -e -p "Name column [name]: " inNameColumn;
nameColumn="${inNameColumn:-name}"

read -e -p "Quadrant column [quadrant]: " inQuadrantColumn;
quadrantColumn="${inQuadrantColumn:-quadrant}"

read -e -p "Is new column [isnew]: " inIsNewColumn;
isNewColumn="${inIsNewColumn:-isnew}"

read -d '' final_command << EOF || true
export MONGO_URI="${MONGO_URI}"
export MONGO_DB_NAME="${MONGO_DB_NAME}"
npm run load-technologies-from-gsheet ${spreadsheetId} ${sheetNumber} "${nameColumn}" "${quadrantColumn}" "${isNewColumn}" 
EOF

/bin/bash .make/utils/execute-in-docker.sh \
-d "run" \
-c "/bin/bash -c \"${final_command}\"" \
-s "byor-voting-server" \
-o "--rm"
