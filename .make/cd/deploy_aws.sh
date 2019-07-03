#!/bin/bash
set -e;

source .make/utils/get_byor_env.sh

echo "Deploying to stage: ${AWS_SERVICE_STAGE} and region: ${AWS_REGION}"

credentials_file="/root/.aws/credentials"
read -d '' final_command << EOF || true
mkdir -p $(dirname ${credentials_file});
touch ${credentials_file};
echo '[byor]' > ${credentials_file};
echo 'aws_access_key_id=${inAwsKeyid}' >> ${credentials_file};
echo 'aws_secret_access_key=${inAwsSecretkey}' >> ${credentials_file};
serverless deploy --stage ${AWS_SERVICE_STAGE} --region ${AWS_REGION}
EOF

/bin/bash .make/utils/execute-in-docker.sh \
-c "/bin/bash -c \"${final_command}\"" \
-s "byor-voting-server" \
-o "--exit-code-from byor-voting-server"

/bin/bash .make/utils/execute-in-docker.sh \
-d "down"
