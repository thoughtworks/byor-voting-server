#!/bin/bash
set -e;

source .make/utils/get_byor_env.sh

read -e -p "Please enter folder where to store the dump [../dump]: " inDumpFolder;
dumpFolder="${inDumpFolder:-../dump}"

cd $dumpFolder

$MONGO_HOME/bin/mongodump --host $MONGO_HOST --ssl --username $MONGO_USER --password $MONGO_PWD --authenticationDatabase $MONGO_AUTH_DB --db $MONGO_DB_NAME
