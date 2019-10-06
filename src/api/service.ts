// The reason to have a single function to execute all Mongo operations is linked to the option of deploying it as
// a serverless function. With serverless we deploy a single function, in this case "mongodbService" and we want to
// share the same session along different executions, at least as long as the same function instance remains alive
// (in AWS a function gets instanciated the firs time it is invoked and remains "alive" for some time afterwards
// so that if it is invoked a second time soon the same instance gets used and startup time is saved).
// In this case we want to initiate a connection to MongoDb when the function is invoked for the first time and
// it is therefore started up, but then we want to reuse the same connection for the following invocations.
// If we have different functions to implement different operations, then we can not share the connection since
// different functions would be deployed as different instances on serverless. We therefore need to have a single function
// which executes different Mongo operations depending on the service name received as input.
// See also
// https://www.mongodb.com/blog/post/serverless-development-with-nodejs-aws-lambda-mongodb-atlas
// https://www.mongodb.com/blog/post/optimizing-aws-lambda-performance-with-mongodb-atlas-and-nodejs
import { Observable, throwError, of } from 'rxjs';
import { switchMap, tap, catchError, timeout, take } from 'rxjs/operators';
import { MongoClient, Db } from 'mongodb';

import { connectObs } from 'observable-mongo';

import { ServiceNames } from '../service-names';
import { config } from './config';
import {
    deleteTechnologies,
    getTechnologies,
    laodTechnologies,
    getTechnology,
    addTechnology,
    updateTechnology,
    cancelTechnology,
    restoreTechnology,
    deleteTechnology,
} from './technologies-apis';
import {
    deleteVotes,
    getVotes,
    laodVotes,
    saveVotes,
    aggregateVotes,
    hasAlreadyVoted,
    calculateBlips,
    calculateBlipsFromAllEvents,
    getVotesCommentsForTech,
    getVotesWithCommentsForTechAndEvent,
    addReplyToVoteComment,
} from './votes-apis';
import {
    createNewVotingEvent,
    getVotingEvents,
    getVotingEvent,
    openVotingEvent,
    closeVotingEvent,
    cancelVotingEvent,
    calculateWinner,
    getVoters,
    openForRevote,
    closeForRevote,
    addNewTechnologyToEvent,
    addCommentToTech,
    addReplyToTechComment,
    undoCancelVotingEvent,
    getVotingEventWithNumberOfCommentsAndVotes,
    moveToNexFlowStep,
    setRecommendationAuthor,
    resetRecommendation,
    setRecommendation,
    setTechologiesForEvent,
    addUsersForVotingEvent,
    loadUsersForVotingEvent,
    loadAdministratorsForVotingEvent,
} from './voting-event-apis';

import { executeTwBlipsCollection, findLatestEdition, getBlipHistoryForTech } from './tw-blips-collection-api';
import { getConfiguration } from './configuration-apis';
import {
    authenticate,
    authenticateForVotingEvent,
    deleteUsers,
    validateRequestAuthentication,
    authenticateOrSetPwdIfFirstTime,
    setAdminUserAndPwd,
} from './authentication-api';
import { saveLog } from './client-log-apis';

import { defaultTWTechnologies } from '../model/technologies.local-data';
import { VOTES } from '../model/vote.local-data';
import { version } from './version';
import { logError } from '../lib/utils';
import {
    createInitiative,
    getInitiatives,
    cancelInitiative,
    loadAdministratorsForInitiative,
    undoCancelInitiative,
} from './initiative-api';
import { IncomingHttpHeaders } from 'http';
export interface CachedDB {
    dbName: string;
    db: Db;
    client: MongoClient;
}

export function isServiceKnown(service: ServiceNames) {
    return (
        service === ServiceNames.version ||
        service === ServiceNames.deleteTechnologies ||
        service === ServiceNames.getTechnologies ||
        service === ServiceNames.loadTechnologies ||
        service === ServiceNames.deleteVotes ||
        service === ServiceNames.getTechnology ||
        service === ServiceNames.addTechnology ||
        service === ServiceNames.updateTechnology ||
        service === ServiceNames.cancelTechnology ||
        service === ServiceNames.undoCancelVotingEvent ||
        service === ServiceNames.deleteTechnology ||
        service === ServiceNames.getVotes ||
        service === ServiceNames.loadVotes ||
        service === ServiceNames.hasAlreadyVoted ||
        service === ServiceNames.saveVotes ||
        service === ServiceNames.aggregateVotes ||
        service === ServiceNames.getVotesCommentsForTech ||
        service === ServiceNames.getVotesWithCommentsForTechAndEvent ||
        service === ServiceNames.addReplyToVoteComment ||
        service === ServiceNames.getVotingEvents ||
        service === ServiceNames.getVotingEvent ||
        service === ServiceNames.getVotingEventWithNumberOfCommentsAndVotes ||
        service === ServiceNames.createVotingEvent ||
        service === ServiceNames.addUsersForVotingEvent ||
        service === ServiceNames.loadAdministratorsForVotingEvent ||
        service === ServiceNames.loadUsersForVotingEvent ||
        service === ServiceNames.openVotingEvent ||
        service === ServiceNames.closeVotingEvent ||
        service === ServiceNames.cancelVotingEvent ||
        service === ServiceNames.calculateWinner ||
        service === ServiceNames.getVoters ||
        service === ServiceNames.setTechologiesForEvent ||
        service === ServiceNames.addNewTechnologyToEvent ||
        service === ServiceNames.addCommentToTech ||
        service === ServiceNames.addReplyToTechComment ||
        service === ServiceNames.calculateBlips ||
        service === ServiceNames.calculateBlipsFromAllEvents ||
        service === ServiceNames.openForRevote ||
        service === ServiceNames.closeForRevote ||
        service === ServiceNames.moveToNexFlowStep ||
        service === ServiceNames.setRecommendationAuthor ||
        service === ServiceNames.setRecommendation ||
        service === ServiceNames.resetRecommendation ||
        service === ServiceNames.getConfiguration ||
        service === ServiceNames.authenticate ||
        service === ServiceNames.authenticateForVotingEvent ||
        service === ServiceNames.authenticateOrSetPwdIfFirstTime ||
        service === ServiceNames.deleteUsers ||
        service === ServiceNames.saveLogInfo ||
        service === ServiceNames.getBlipHistoryForTech ||
        service === ServiceNames.createInitiative ||
        service === ServiceNames.getInitiatives ||
        service === ServiceNames.cancelInitiative ||
        service === ServiceNames.undoCancelInitiative ||
        service === ServiceNames.loadAdministratorsForInitiative ||
        service === ServiceNames.setAdminUserAndPwd
    );
}

export function mongodbService(
    cachedDb: CachedDB,
    service: ServiceNames,
    serviceData?: any,
    ipAddress?: string,
    reqHeaders?: IncomingHttpHeaders,
) {
    const mongoTimeout = serviceData ? serviceData.timeout : null;
    if (cachedDb.db == null || !cachedDb.client.isConnected(cachedDb.dbName)) {
        return connectObs(config.mongoUri).pipe(
            tap(client => {
                cachedDb.db = client.db(cachedDb.dbName);
                cachedDb.client = client;
            }),
            catchError(err => {
                logError('Error while connecting to Mongo ' + err);
                return throwError('Error while connecting to MongoDB');
            }),
            switchMap(() =>
                executeMongoService(service, cachedDb.db, serviceData, mongoTimeout, ipAddress, reqHeaders),
            ),
        );
    } else {
        return executeMongoService(service, cachedDb.db, serviceData, mongoTimeout, ipAddress, reqHeaders);
    }
}

export function mongodbServiceForTWBlips(cachedDb: CachedDB, serviceData?: any) {
    const mongoTimeout = serviceData ? serviceData.timeout : null;
    if (cachedDb.db == null || !cachedDb.client.isConnected(cachedDb.dbName)) {
        return connectObs(config.mongoUri).pipe(
            tap(client => {
                cachedDb.db = client.db(cachedDb.dbName);
                cachedDb.client = client;
            }),
            err => {
                logError('Error while connecting to Mongo ' + err);
                return throwError('Error while connecting to MongoDB');
            },
            switchMap(() => executeQueryForCollectingTWBlips(cachedDb.db, mongoTimeout)),
        );
    } else {
        return executeQueryForCollectingTWBlips(cachedDb.db, mongoTimeout);
    }
}

function executeQueryForCollectingTWBlips(db: Db, mongoTimeout): Observable<any> {
    const twBlipsCollection = db.collection(config.twBlipsCollection);
    const timeOut = mongoTimeout ? mongoTimeout : config.defautlTimeout;
    return findLatestEdition(twBlipsCollection).pipe(
        take(1),
        switchMap(latestBlip => {
            return executeTwBlipsCollection(twBlipsCollection, latestBlip.edition);
        }),
        timeout(timeOut),
    );
}

function executeMongoService(
    service: ServiceNames,
    db: Db,
    serviceData: any,
    mongoTimeout: number,
    ipAddress?: string,
    reqHeaders?: IncomingHttpHeaders,
) {
    const technologiesColl = db.collection(config.technologiesCollection);
    const votesColl = db.collection(config.votesCollection);
    const votingEventColl = db.collection(config.votingEventsCollection);
    const configurationColl = db.collection(config.configurationCollection);
    const usersColl = db.collection(config.usersCollection);
    const logColl = db.collection(config.logCollection);
    const twBlipsColl = db.collection(config.twBlipsCollection);
    const initiativeColl = db.collection(config.initiativeCollection);

    let user: string;
    if (reqHeaders && reqHeaders['authorization']) {
        try {
            user = validateRequestAuthentication(reqHeaders).user;
        } catch (err) {
            if (err.message !== 'Token is not valid') {
                throwError(err);
            }
        }
    } else if (serviceData.userId) {
        user = serviceData.userId;
    }

    let returnedObservable: Observable<any>;
    const timeOut = mongoTimeout ? mongoTimeout : config.defautlTimeout;
    if (service === ServiceNames.version) {
        returnedObservable = of(version);
    } else if (service === ServiceNames.getTechnologies) {
        returnedObservable = getTechnologies(technologiesColl, serviceData);
    } else if (service === ServiceNames.loadTechnologies) {
        const technologies = serviceData ? serviceData : defaultTWTechnologies();
        returnedObservable = laodTechnologies(technologiesColl, technologies);
    } else if (service === ServiceNames.deleteTechnologies) {
        returnedObservable = deleteTechnologies(technologiesColl);
    } else if (service === ServiceNames.getTechnology) {
        returnedObservable = getTechnology(technologiesColl, serviceData);
    } else if (service === ServiceNames.addTechnology) {
        returnedObservable = addTechnology(technologiesColl, serviceData);
    } else if (service === ServiceNames.updateTechnology) {
        returnedObservable = updateTechnology(technologiesColl, serviceData);
    } else if (service === ServiceNames.cancelTechnology) {
        returnedObservable = cancelTechnology(technologiesColl, serviceData);
    } else if (service === ServiceNames.restoreTechnology) {
        returnedObservable = restoreTechnology(technologiesColl, serviceData);
    } else if (service === ServiceNames.deleteTechnology) {
        returnedObservable = deleteTechnology(technologiesColl, serviceData);
    } else if (service === ServiceNames.getVotes) {
        returnedObservable = getVotes(votesColl, serviceData);
    } else if (service === ServiceNames.loadVotes) {
        const votes = serviceData ? serviceData : VOTES;
        returnedObservable = laodVotes(votesColl, votes);
    } else if (service === ServiceNames.deleteVotes) {
        returnedObservable = deleteVotes(votesColl);
    } else if (service === ServiceNames.hasAlreadyVoted) {
        returnedObservable = hasAlreadyVoted(votesColl, votingEventColl, serviceData);
    } else if (service === ServiceNames.saveVotes) {
        returnedObservable = saveVotes(votesColl, votingEventColl, serviceData, ipAddress);
    } else if (service === ServiceNames.aggregateVotes) {
        returnedObservable = aggregateVotes(votesColl, serviceData);
    } else if (service === ServiceNames.getVotesCommentsForTech) {
        returnedObservable = getVotesCommentsForTech(votesColl, serviceData);
    } else if (service === ServiceNames.getVotesWithCommentsForTechAndEvent) {
        returnedObservable = getVotesWithCommentsForTechAndEvent(votesColl, serviceData);
    } else if (service === ServiceNames.addReplyToVoteComment) {
        returnedObservable = addReplyToVoteComment(votesColl, usersColl, serviceData, user);
    } else if (service === ServiceNames.createVotingEvent) {
        returnedObservable = createNewVotingEvent(votingEventColl, initiativeColl, serviceData, user);
    } else if (service === ServiceNames.addUsersForVotingEvent) {
        returnedObservable = addUsersForVotingEvent(votingEventColl, usersColl, serviceData, user);
    } else if (service === ServiceNames.loadAdministratorsForVotingEvent) {
        returnedObservable = loadAdministratorsForVotingEvent(votingEventColl, serviceData, user);
    } else if (service === ServiceNames.loadUsersForVotingEvent) {
        returnedObservable = loadUsersForVotingEvent(votingEventColl, usersColl, serviceData, user);
    } else if (service === ServiceNames.getVotingEvents) {
        returnedObservable = getVotingEvents(votingEventColl, serviceData);
    } else if (service === ServiceNames.getVotingEvent) {
        returnedObservable = getVotingEvent(votingEventColl, serviceData);
    } else if (service === ServiceNames.getVotingEventWithNumberOfCommentsAndVotes) {
        returnedObservable = getVotingEventWithNumberOfCommentsAndVotes(votingEventColl, votesColl, serviceData);
    } else if (service === ServiceNames.openVotingEvent) {
        returnedObservable = openVotingEvent(votingEventColl, technologiesColl, serviceData, user);
    } else if (service === ServiceNames.closeVotingEvent) {
        returnedObservable = closeVotingEvent(votingEventColl, serviceData, user);
    } else if (service === ServiceNames.cancelVotingEvent) {
        returnedObservable = cancelVotingEvent(votingEventColl, votesColl, serviceData, user);
    } else if (service === ServiceNames.undoCancelVotingEvent) {
        returnedObservable = undoCancelVotingEvent(votingEventColl, votesColl, serviceData, user);
    } else if (service === ServiceNames.calculateWinner) {
        returnedObservable = calculateWinner(votesColl, votingEventColl, serviceData);
    } else if (service === ServiceNames.setTechologiesForEvent) {
        returnedObservable = setTechologiesForEvent(votingEventColl, serviceData, user);
    } else if (service === ServiceNames.addNewTechnologyToEvent) {
        returnedObservable = addNewTechnologyToEvent(votingEventColl, serviceData);
    } else if (service === ServiceNames.addCommentToTech) {
        returnedObservable = addCommentToTech(votingEventColl, serviceData, user);
    } else if (service === ServiceNames.addReplyToTechComment) {
        returnedObservable = addReplyToTechComment(votingEventColl, serviceData, user);
    } else if (service === ServiceNames.getVoters) {
        returnedObservable = getVoters(votesColl, serviceData);
    } else if (service === ServiceNames.calculateBlips) {
        returnedObservable = calculateBlips(votesColl, votingEventColl, serviceData);
    } else if (service === ServiceNames.calculateBlipsFromAllEvents) {
        returnedObservable = calculateBlipsFromAllEvents(votesColl, serviceData);
    } else if (service === ServiceNames.openForRevote) {
        returnedObservable = openForRevote(votingEventColl, serviceData);
    } else if (service === ServiceNames.closeForRevote) {
        returnedObservable = closeForRevote(votingEventColl, serviceData);
    } else if (service === ServiceNames.getConfiguration) {
        returnedObservable = getConfiguration(configurationColl, serviceData);
    } else if (service === ServiceNames.moveToNexFlowStep) {
        returnedObservable = moveToNexFlowStep(votingEventColl, votesColl, serviceData, user);
    } else if (service === ServiceNames.setRecommendationAuthor) {
        returnedObservable = setRecommendationAuthor(votingEventColl, serviceData, user);
    } else if (service === ServiceNames.setRecommendation) {
        returnedObservable = setRecommendation(votingEventColl, usersColl, serviceData, user);
    } else if (service === ServiceNames.resetRecommendation) {
        returnedObservable = resetRecommendation(votingEventColl, serviceData, user);
    } else if (service === ServiceNames.authenticate) {
        returnedObservable = authenticate(usersColl, serviceData);
    } else if (service === ServiceNames.authenticateForVotingEvent) {
        returnedObservable = authenticateForVotingEvent(usersColl, votingEventColl, serviceData);
    } else if (service === ServiceNames.authenticateOrSetPwdIfFirstTime) {
        returnedObservable = authenticateOrSetPwdIfFirstTime(usersColl, serviceData);
    } else if (service === ServiceNames.deleteUsers) {
        returnedObservable = deleteUsers(usersColl, serviceData);
    } else if (service === ServiceNames.saveLogInfo) {
        returnedObservable = saveLog(logColl, serviceData, ipAddress);
    } else if (service === ServiceNames.getBlipHistoryForTech) {
        returnedObservable = getBlipHistoryForTech(twBlipsColl, serviceData);
    } else if (service === ServiceNames.createInitiative) {
        returnedObservable = createInitiative(initiativeColl, usersColl, serviceData, user);
    } else if (service === ServiceNames.getInitiatives) {
        returnedObservable = getInitiatives(initiativeColl, serviceData);
    } else if (service === ServiceNames.cancelInitiative) {
        returnedObservable = cancelInitiative(initiativeColl, votingEventColl, votesColl, usersColl, serviceData, user);
    } else if (service === ServiceNames.undoCancelInitiative) {
        returnedObservable = undoCancelInitiative(
            initiativeColl,
            votingEventColl,
            votesColl,
            usersColl,
            serviceData,
            user,
        );
    } else if (service === ServiceNames.loadAdministratorsForInitiative) {
        returnedObservable = loadAdministratorsForInitiative(initiativeColl, usersColl, serviceData, user);
    } else if (service === ServiceNames.setAdminUserAndPwd) {
        returnedObservable = setAdminUserAndPwd(usersColl, serviceData);
    } else {
        const serviceResult = { error: 'Mongo Service ' + service + ' not defined' };
        returnedObservable = throwError(serviceResult);
    }
    return returnedObservable.pipe(timeout(timeOut));
}
