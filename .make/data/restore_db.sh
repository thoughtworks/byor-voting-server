#!/bin/bash
set -e;

source .make/utils/get_byor_env.sh

read -e -p "Please enter folder where to read the dump from [../dump]: " inDumpFolder;
dumpFolder="${inDumpFolder:-../dump}"

cd $dumpFolder

if [ $MONGO_HOST == "localhost:27017"]; then
    $MONGO_HOME/bin/mongorestore --host $MONGO_HOST --drop
else
    $MONGO_HOME/bin/mongorestore --host $MONGO_HOST --ssl --username $MONGO_USER --password $MONGO_PWD --authenticationDatabase $MONGO_AUTH_DB --db $MONGO_DB_NAME
fi