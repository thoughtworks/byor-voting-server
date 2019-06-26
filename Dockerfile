ARG NODE_VERSION=10-alpine

FROM byoritaly/byor-voting-base:${NODE_VERSION} AS dev

# Install Serveless framework
RUN npm install -g serverless@~1.40.0

FROM node:${NODE_VERSION} AS compile

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run tsc

FROM node:${NODE_VERSION} AS prod

WORKDIR /usr/src/app

COPY --from=compile /usr/src/app/package*.json ./
RUN npm ci --only=production

COPY --from=compile /usr/src/app/dist ./dist

EXPOSE 3000

CMD [ "npm", "run", "start" ]
