import { APIGatewayEvent, Callback, Context } from 'aws-lambda';
import { CachedDB, isServiceKnown, mongodbService } from './src/api/service';
import { ServiceNames } from './src/service-names';
import { config } from './src/api/config';
import { buildError, buildResponse } from './src/api/response-util';
import { getBlips, getBlipsForReVote } from './src/services/blips-service';
import { logError, logDebug, logInfo } from './src/lib/utils';
import { inspect } from 'util';
const cachedDb: CachedDB = { dbName: config.dbname, db: null, client: null };

// each service called should return a Object with 1 property
export function _executeService(event: APIGatewayEvent, context: Context, callback: Callback<any>) {
    const ipAddress = event.requestContext.identity.sourceIp;
    const postBody = JSON.parse(event.body);
    let service = ServiceNames.noservice;
    let serviceName = 'noservice';
    if (postBody && postBody.service) {
        serviceName = postBody.service;
        service = ServiceNames[serviceName];
    }

    let serviceResult: any;
    if (service === ServiceNames.alive) {
        logDebug('I pass through here ' + ServiceNames[service]);
        serviceResult = { alive: `true` };
        sendResponse(serviceName, serviceResult, callback);
    } else if (isServiceKnown(service)) {
        // https://www.mongodb.com/blog/post/serverless-development-with-nodejs-aws-lambda-mongodb-atlas
        // https://www.mongodb.com/blog/post/optimizing-aws-lambda-performance-with-mongodb-atlas-and-nodejs
        logDebug('I pass through here ' + ServiceNames[service]);
        if (!cachedDb.db) {
            logDebug('Connect to the db ' + cachedDb);
        }
        context.callbackWaitsForEmptyEventLoop = false;
        mongodbService(cachedDb, service, postBody, ipAddress).subscribe(
            serviceResult => sendResponse(serviceName, serviceResult, callback),
            error => {
                logError('error in the mongodbService execution: ' + inspect(error));
                sendError(serviceName, error, callback, 200);
            },
            () => logDebug('Mongo service ' + ServiceNames[service] + ' executed'),
        );
    } else if (service === ServiceNames.noservice) {
        logDebug('I pass through here ' + ServiceNames[service]);
        serviceResult = { error: `No Service received` };
        sendResponse(serviceName, serviceResult, callback);
    } else {
        logDebug('I pass through here ' + 'default');
        serviceResult = { error: `Service ${serviceName} not defined` };
        sendResponse(serviceName, serviceResult, callback);
    }
}

let buildCsvResponse = function(params: any, service: ServiceNames, ipAddress, callback: Callback<any>) {
    getBlips(cachedDb, service, params, ipAddress).subscribe(
        serviceResult => sendCsvResponse(serviceResult, callback),
        error => {
            logError('executeMongoService error ' + inspect(error));
            sendError(service.toString(), error, callback, 300);
        },
        () => logDebug('Mongo service ' + ServiceNames[service] + ' executed'),
    );
};

let buildCsvResponseForRevote = function(params: any, service: ServiceNames, ipAddress, callback: Callback<any>) {
    getBlipsForReVote(cachedDb, service, params, ipAddress).subscribe(
        serviceResult => sendCsvResponse(serviceResult, callback),
        error => {
            logError('executeMongoService error ' + inspect(error));
            sendError(service.toString(), error, callback, 300);
        },
        () => logDebug('Mongo service ' + ServiceNames[service] + ' executed'),
    );
};

function extractUrlParams(event: APIGatewayEvent) {
    if (event.queryStringParameters) {
        return {
            baseUrl: event.queryStringParameters['serviceUrl'] || '',
            radarUrl: event.queryStringParameters['radarUrl'] || '',
        };
    }
    return { baseUrl: '', radarUrl: '' };
}

export function getAllBlips(event: APIGatewayEvent, context: Context, callback: Callback<any>) {
    const ipAddress = event.requestContext.identity.sourceIp;
    context.callbackWaitsForEmptyEventLoop = false;
    let service = ServiceNames.calculateBlipsFromAllEvents;
    logDebug('executing getting all blips with service: ' + ServiceNames.calculateBlipsFromAllEvents);
    const urlParams = extractUrlParams(event);
    let params = {
        ...urlParams,
        thresholdForRevote: event.queryStringParameters
            ? event.queryStringParameters['thresholdForRevote']
            : config.thresholdForRevote,
    };
    buildCsvResponse(params, service, ipAddress, callback);
}

export function getBlipsForEvent(event: APIGatewayEvent, context: Context, callback: Callback<any>) {
    const ipAddress = event.requestContext.identity.sourceIp;
    context.callbackWaitsForEmptyEventLoop = false;
    let params = {
        votingEvent: { _id: event.pathParameters['id'] },
        thresholdForRevote: event.queryStringParameters
            ? event.queryStringParameters['thresholdForRevote']
            : config.thresholdForRevote,
    };
    let service = ServiceNames.calculateBlips;
    logDebug('executing getting blips per event with service: ' + ServiceNames.calculateBlips);
    buildCsvResponse(params, service, ipAddress, callback);
}

export function getBlipsForRevote(event: APIGatewayEvent, context: Context, callback: Callback<any>) {
    const ipAddress = event.requestContext.identity.sourceIp;
    context.callbackWaitsForEmptyEventLoop = false;
    let params = {
        votingEvent: { _id: event.pathParameters['id'] },
        thresholdForRevote: event.queryStringParameters
            ? event.queryStringParameters['thresholdForRevote']
            : config.thresholdForRevote,
    };
    let service = ServiceNames.calculateBlips;
    logDebug('executing getting blips for revote per event with service: ' + ServiceNames.calculateBlips);
    buildCsvResponseForRevote(params, service, ipAddress, callback);
}

function sendCsvResponse(serviceResult: any, callback: Callback<any>, statusCode: number = 200) {
    logInfo('response: ' + serviceResult);
    const response = {
        statusCode,
        body: serviceResult,
    };
    addHeadersForCORS(response);
    logInfo('response sent' + response);
    callback(null, response);
}

function sendResponse(serviceName: string, serviceResult: any, callback: Callback<any>, statusCode: number = 200) {
    const responseObj = buildResponse(serviceName, statusCode, serviceResult);
    send(responseObj, callback, statusCode);
}

function sendError(serviceName: string, error: any, callback: Callback<any>, statusCode: number = 200) {
    const responseObj = buildError(serviceName, error, statusCode);
    send(responseObj, callback, statusCode);
}

function send(responseObj: any, callback: Callback<any>, statusCode: number = 200) {
    const response = {
        statusCode,
        body: JSON.stringify(responseObj),
    };
    addHeadersForCORS(response);
    logInfo('response sent' + response);
    callback(null, response);
}

function addHeadersForCORS(response) {
    response.headers = {
        'Access-Control-Allow-Origin': '*', // Required for CORS support to work
        // "Access-Control-Allow-Methods" : 'GET,PUT,POST,DELETE',
        // "Access-Control-Allow-Headers" : "X-Requested-With, Content-Type",
        'Access-Control-Allow-Credentials': true, // Required for cookies, authorization headers with HTTPS
    };
}
