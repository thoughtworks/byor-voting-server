# BYOR VotingApp [server]

[![CircleCI](https://circleci.com/gh/byor-italy/byor-backend/tree/master.svg?style=svg&circle-token=25c013345998789688643105806c437bc8c9fab8)](https://circleci.com/gh/byor-italy/byor-backend/tree/master) [![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/) [![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

Welcome to the repository for the server component of **BYOR-VotingApp**!

You can find more information about the BYOR-VotingApp in the web-app Github [repository](https://github.com/thoughtworks/byor-voting-web-app).

## Running API server locally

1. install [Docker](https://www.docker.com/get-started)
1. open the terminal
1. clone the project
    ```shell
    git clone https://github.com/thoughtworks/byor-voting-server.git
    ```
1. move into the project folder
    ```shell
    cd byor-voting-server
    ```
1. startup web app, server, and a local MongoDB
    ```shell
    docker-compose up
    ```
1. access the API on [http://localhost:3000](http://localhost:3000)

> Please refer to [CONTRIBUTING.md](CONTRIBUTING.md) for more options on running the server locally and connect to a MongoDB database.

## Running BYOR-VotingApp on Kubernetes

Please refer to [BYOR-VotingApp \[infrastructure\]](https://github.com/thoughtworks/byor-voting-infrastructure) Github repository for installing the application on Kubernetes.

## How to contribute to the project

Please refer to [CONTRIBUTING.md](CONTRIBUTING.md) for all the information about how to contribute.
