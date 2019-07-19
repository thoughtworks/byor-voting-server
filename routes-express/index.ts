import { NextFunction, Request, Response } from 'express';

import { CachedDB, isServiceKnown, mongodbService, mongodbServiceForTWBlips } from '../src/api/service';
import { config } from '../src/api/config';
import { ServiceNames } from '../src/service-names';
import { buildError, buildResponse } from '../src/api/response-util';
import { getBlips, getBlipsForReVote } from '../src/services/blips-service';
import { noAuthServiceNames } from '../src/no-auth-service-names';
import { validateRequestAuthentication } from '../src/api/authentication-api';
import { logError, logDebug } from '../src/lib/utils';
import { inspect } from 'util';
const cachedDb: CachedDB = { dbName: config.dbname, db: null, client: null };

const express = require('express');
export const router = express.Router();

router.use(function(_req: Request, _res: Response, next: NextFunction) {
    next();
});
let ipAddress: string;
router.use(function(req: Request, _res: Response, next: NextFunction) {
    ipAddress = req.ip;
    next();
});

router.get('/votes/blips.csv', function(request, response) {
    const urlParams = extractUrlParams(request);
    let service = ServiceNames.calculateBlipsFromAllEvents;
    let params = {
        ...urlParams,
        body: request.body,
    };

    getBlips(cachedDb, service, params, ipAddress).subscribe(
        serviceResult => setCsvResponse(serviceResult, response),
        error => {
            logError('executeMongoService for error ' + inspect(error));
            sendError(service.toString(), error, response, 300);
        },
        () => logDebug('Mongo service ' + ServiceNames[service] + 'for revote executed'),
    );
});

router.get('/votes/:id/blips.csv', function(request, response) {
    let params = {
        votingEvent: { _id: request.params.id },
        thresholdForRevote: request.query['thresholdForRevote'],
    };

    let service = ServiceNames.calculateBlips;
    getBlips(cachedDb, service, params, ipAddress).subscribe(
        serviceResult => setCsvResponse(serviceResult, response),
        error => {
            logError('executeMongoService for error' + inspect(error));
            sendError(service.toString(), error, response, 300);
        },
        () => logDebug('Mongo service ' + ServiceNames[service] + 'executed'),
    );
});

router.get('/votes/:id/revote/blips.csv', function(request, response) {
    let params = {
        votingEvent: { _id: request.params.id },
        thresholdForRevote: request.query['thresholdForRevote'],
    };

    let service = ServiceNames.calculateBlips;
    getBlipsForReVote(cachedDb, service, params, ipAddress).subscribe(
        serviceResult => setCsvResponse(serviceResult, response),
        error => {
            logError('executeMongoService for error' + inspect(error));
            sendError(service.toString(), error, response, 300);
        },
        () => logDebug('Mongo service ' + ServiceNames[service] + 'executed'),
    );
});

router.get('/tw/blips.csv', function(request, response) {
    let service = ServiceNames.calculateBlips;
    const params = {
        votingEvent: { _id: request.params.id },
        thresholdForRevote: request.query['thresholdForRevote'],
    };
    mongodbServiceForTWBlips(cachedDb, params).subscribe(
        serviceResult => sendResponse(service.toString(), serviceResult, response),
        error => {
            logError('executeMongoService for error' + inspect(error));
            sendError(service.toString(), error, response, 300);
        },
        () => logDebug('Mongo service ' + ServiceNames[service] + 'executed'),
    );
});

function isAdminCall(serviceName: string) {
    return !noAuthServiceNames().includes(serviceName);
}

/* Launches the execution of the service on a POST verb. */
router.post('/', function(req: Request, res: Response, _next: NextFunction) {
    const params = req.body;
    let service = ServiceNames.noservice;
    let serviceName = '';
    if (params && params.service) {
        serviceName = params.service;
        service = ServiceNames[serviceName];
    }
    if (isAdminCall(serviceName)) {
        try {
            validateRequestAuthentication(req.headers);
        } catch (error) {
            return res.status(401).send({
                success: false,
                message: error.message,
            });
        }
    }
    let serviceResult: any;
    logDebug('I pass through here' + ServiceNames[service]);
    if (service === ServiceNames.alive) {
        serviceResult = { alive: `true` };
        sendResponse(serviceName, serviceResult, res);
    } else if (isServiceKnown(service)) {
        if (!cachedDb.db) {
            logDebug('Connect to the db ' + cachedDb);
        }
        executeMongoService(cachedDb, serviceName, params, res);
    } else if (service === ServiceNames.noservice) {
        serviceResult = { error: `No Service received` };
        sendResponse(serviceName, serviceResult, res);
    } else {
        logDebug('I pass through here default');
        const error = { error: `Service ${serviceName} not defined` };
        sendError(serviceName, error, res, 310);
    }
});

router.get('/getTechnologies', function(req: Request, res: Response, _next: NextFunction) {
    const params = req.query;
    let serviceName = ServiceNames[ServiceNames.getTechnologies];
    executeMongoService(cachedDb, serviceName, params, res);
});

router.post('/saveVotes', function(req: Request, res: Response, _next: NextFunction) {
    const params = req.body;
    let serviceName = ServiceNames[ServiceNames.saveVotes];
    executeMongoService(cachedDb, serviceName, params, res);
});

router.get('/aggregateVotes', function(req: Request, res: Response, _next: NextFunction) {
    const params = req.query;
    let serviceName = ServiceNames[ServiceNames.aggregateVotes];
    executeMongoService(cachedDb, serviceName, params, res);
});

router.get('/getVotingEvents', function(req: Request, res: Response, _next: NextFunction) {
    const params = req.query;
    let serviceName = ServiceNames[ServiceNames.getVotingEvents];
    executeMongoService(cachedDb, serviceName, params, res);
});

router.post('/createVotingEvent', function(req: Request, res: Response, _next: NextFunction) {
    const params = req.body;
    let serviceName = ServiceNames[ServiceNames.createVotingEvent];
    executeMongoService(cachedDb, serviceName, params, res);
});

router.post('/openVotingEvent', function(req: Request, res: Response, _next: NextFunction) {
    const params = req.body;
    let serviceName = ServiceNames[ServiceNames.openVotingEvent];
    executeMongoService(cachedDb, serviceName, params, res);
});

router.post('/closeVotingEvent', function(req: Request, res: Response, _next: NextFunction) {
    const params = req.body;
    let serviceName = ServiceNames[ServiceNames.closeVotingEvent];
    executeMongoService(cachedDb, serviceName, params, res);
});

function executeMongoService(cachedDb: CachedDB, serviceName: string, params: any, res: Response) {
    const service = ServiceNames[serviceName];
    mongodbService(cachedDb, service, params, ipAddress).subscribe(
        serviceResult => sendResponse(serviceName, serviceResult, res),
        error => {
            logError('executeMongoService error' + inspect(error));
            sendError(serviceName, error, res, 300);
        },
        () => logDebug('Mongo service ' + ServiceNames[service] + ' executed'),
    );
}

function sendResponse(serviceName: string, serviceResult: any, res: Response, statusCode?: number) {
    const code = statusCode ? statusCode : 200;
    const response = buildResponse(serviceName, code, serviceResult);
    logDebug('response ' + response);
    res.send(response);
}

function sendError(serviceName: string, error: any, res: Response, _statusCode?: number) {
    const response = buildError(serviceName, error, _statusCode);
    logDebug('error' + response);
    res.send(response);
}

function setCsvResponse(csvResult, res: Response, statusCode?: number) {
    const code = statusCode ? statusCode : 200;
    res.setHeader('Content-disposition', 'inline; filename=blips.csv');
    res.contentType('text/csv; charset=utf-8');
    res.status(code).send(csvResult);
}

function extractUrlParams(request) {
    if (request.query) {
        return {
            baseUrl: request.query['serviceUrl'] || '',
            radarUrl: request.query['radarUrl'] || '',
        };
    }
    return {
        baseUrl: '',
        radarUrl: '',
    };
}
