#!/bin/bash
set -e;

watch=""
if [ -z "${CI}" ]; then
    read -e -p "Do you want to run tests in watch mode? [Y/n] " input_watch;
    if [[ ! ${input_watch} == n ]]; then
        watch=":watch"
    fi
fi

full_command="npm run ${test_script}${watch}"
echo "About to execute: ${full_command}"

case "${test_script}" in
    test)
        /bin/bash .make/utils/execute-in-docker.sh \
        -c "${full_command}" \
        -s "byor-backend" \
        -o "--exit-code-from byor-backend";;
    test:integration)
        /bin/bash .make/utils/execute-in-docker.sh \
        -c "${full_command}" \
        -f "docker-compose.integration-tests.yml" \
        -o "--exit-code-from byor-backend";;
    *)
        echo "ERROR: ${test_script} is not supported"
        exit 1;;
esac
