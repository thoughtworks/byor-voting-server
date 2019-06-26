#!/bin/bash
set -e;

export CI="true"

make install
make lint
make tsc
make unit_tests
make integration_tests
