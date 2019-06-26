#!/bin/bash
set -e;

if [ -z "${CI}" ]; then
    read -e -p "Please enter the target stage [dev]: " inStage;
    read -e -p "Please enter your AWS access key id: " keyid;
    read -e -p "Please enter your AWS secret access key (input hidden)" -s secretkey;
    echo ""
    read -e -p "Please enter your AWS region [us-east-1]: " inAwsRegion;
else
    inStage="${AWS_SERVICE_STAGE}"
    keyid="${AWS_ACCESS_KEY_ID}"
    secretkey="${AWS_SECRET_ACCESS_KEY}"
    inAwsRegion="${AWS_REGION}"
fi

stage="${inStage:-dev}"
awsRegion="${inAwsRegion:-us-east-1}"

echo "Deploying to stage: ${stage} and region: ${awsRegion}"

credentials_file="/root/.aws/credentials"
read -d '' final_command << EOF || true
mkdir -p $(dirname ${credentials_file});
touch ${credentials_file};
echo '[byor]' > ${credentials_file};
echo 'aws_access_key_id=${keyid}' >> ${credentials_file};
echo 'aws_secret_access_key=${secretkey}' >> ${credentials_file};
serverless deploy --stage ${stage} --region ${awsRegion}
EOF

/bin/bash .make/utils/execute-in-docker.sh \
-c "/bin/bash -c \"${final_command}\"" \
-s "byor-backend" \
-o "--exit-code-from byor-backend"

/bin/bash .make/utils/execute-in-docker.sh \
-d "down"
