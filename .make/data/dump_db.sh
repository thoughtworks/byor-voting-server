#!/bin/bash
set -e;

if [ -z $BYOR_ENV ]; then
    read -e -p "Please enter a target environment [local-dev]: " inByorEnv;
    byorEnv="_${inByorEnv:-local-dev}"
else
    byorEnv="_${BYOR_ENV}"
fi

read -e -p "Please enter folder where to store the dump [./db]: " inDumpFolder;
dumpFolder="${inDumpFolder:-./db}"

set -a
source config/byor${byorEnv}.sh
set +a

cd $dumpFolder

$MONGO_HOME/bin/mongodump --host $MONGO_HOST --ssl --username $MONGO_USER --password $MONGO_PWD --authenticationDatabase $MONGO_AUTH_DB --db $MONGO_DB
