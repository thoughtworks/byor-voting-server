#!/bin/bash
set -e;

read -e -p "This will override the existing user name and password for the admin user... are you sure to continue? [y/N] " response;
if [[ ! ${response} == y ]]; then
    echo "Aborting on user choice"
    exit 1;
fi

if [ -z $BYOR_ENV ]; then
        read -e -p "Please enter a target environment [local-dev]: " inByorEnv;
        byorEnv="_${inByorEnv:-local-dev}"
else
    byorEnv="_${BYOR_ENV}"
fi

read -e -p "Please enter old admin user name [admin]: " inOldAdminUsername;
oldAdminUsername="${inOldAdminUsername:-admin}"

read -e -p "Please enter new admin user name [admin]: " inNewAdminUsername;
newAdminUsername="${inNewAdminUsername:-admin}"

echo "Please enter admin password:"
echo "  basic rules:"
echo "  - no empty password"
echo "  - at least 3 characters long"
echo "  - not equal to user name"
echo "  - no double quotes (\") or single quotes (')"
while true; do
    read -s -p "new password: " inAdminPwd
    echo
    read -s -p "confirm password: " inAdminPwd2
    echo
    [ -n $inAdminPwd ] && [ ${#inAdminPwd} -ge 3 ] && [[ ! $inAdminPwd == $newAdminUsername ]] && [[ ! $inAdminPwd =~ "'" ]] && [[ ! $inAdminPwd =~ "\"" ]] && [ $inAdminPwd = "$inAdminPwd2" ] &&  break
    echo "Please try again"
done
newAdminPassword="$inAdminPwd"

read -d '' final_command << EOF || true
export TRACE_LEVEL=${TRACE_LEVEL}
set -a
source config/byor${byorEnv}.sh
set +a
npm run --silent set-admin-user-and-pwd '${oldAdminUsername}' '${newAdminUsername}' '${newAdminPassword}'
EOF

/bin/bash .make/utils/execute-in-docker.sh \
-d "run" \
-c "/bin/bash -c \"${final_command}\"" \
-s "byor-backend" \
-o "--rm"
