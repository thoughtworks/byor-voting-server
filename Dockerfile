ARG NODE_VERSION=10.23.0-alpine

FROM node:${NODE_VERSION} AS build

# Install Serveless framework
RUN npm install -g serverless@~1.40.0

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run tsc

FROM node:${NODE_VERSION} AS prod

WORKDIR /usr/src/app

COPY --from=build /usr/src/app/package*.json ./
RUN npm ci --only=production

COPY --from=build /usr/src/app/dist ./dist

EXPOSE 3000

CMD [ "npm", "run", "start" ]
