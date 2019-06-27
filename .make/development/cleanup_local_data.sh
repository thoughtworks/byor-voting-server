#!/bin/bash
set -e;

read -e -p "This will delete all your local byor-voting-server data, if any... are you sure to continue? [y/N] " response;
if [[ ! ${response} == y ]]; then
    echo "Aborting on user choice"
    exit 1;
fi

/bin/bash .make/utils/execute-in-docker.sh \
-d "rm" \
-f "docker-compose.local-dev.yml" \
-o "-v -s -f"

/bin/bash .make/utils/execute-in-docker.sh \
-d "down" \
-f "docker-compose.local-dev.yml" \
-o "-v"

read -e -p "Do you also want to remove all unused containers, volumes, networks and images (both dangling and unreferenced)? [y/N] " response;
if [[ ${response} == y ]]; then
    echo "Removing all unused containers, volumes, networks and images..."
    docker system prune --volumes -f
    echo "...done"
fi
