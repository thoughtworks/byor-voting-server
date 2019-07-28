import { concatMap, tap, map, finalize, toArray } from 'rxjs/operators';
import { mongodbService, CachedDB } from '../../../api/service';
import { config } from '../../../api/config';
import { MongoClient } from 'mongodb';
import { connectObs, updateOneObs } from 'observable-mongo';
import { ServiceNames } from '../../../service-names';
import { VotingEvent } from '../../../model/voting-event';
import {
    CorporateVotingEventFlow,
    CORPORATE_VOTING_EVENT_TAGS,
} from '../../../voting-event-flow-templates/corporate-voting-event-flow';
import { CommunityVotingEventFlow } from '../../../voting-event-flow-templates/community-voting-event-flow';
import { Credentials } from '../../../model/credentials';
import { VoteCredentialized } from '../../../model/vote-credentialized';
import { Initiative } from '../../../model/initiative';
import { pipe } from 'rxjs';
import { readCsvLineObs$ } from '../../../lib/observables';

const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

const initiative: Initiative = { name: 'Tech Radar for the Smart Company' };

const companyEvent: VotingEvent = {
    name: 'The Smart Company Tech Radar',
    flow: CorporateVotingEventFlow,
    creator: { userId: 'the setupper' },
};
const communityEvent: VotingEvent = {
    name: 'A Radar the Smart Company organizes for a Community Event',
    flow: CommunityVotingEventFlow,
    creator: { userId: 'the setupper' },
};

const tony_dev: Credentials = { nickname: 'Tony the Dev' };
const mary_dev: Credentials = { nickname: 'Mary the mighty Dev' };
const kent_dev: Credentials = { nickname: 'Kent the old dev' };
const martin_dev: Credentials = { nickname: 'Martin the shy dev' };

const initializeConn = (dbName: string) => {
    let mongoClient: MongoClient;
    return connectObs(config.mongoUri).pipe(
        tap(client => (mongoClient = client)),
        map(client => client.db(dbName)),
        finalize(() => mongoClient.close()),
    );
};

initializeConn(cachedDb.dbName)
    .pipe(
        cleanDb(),
        createInitiative(),
        createSmartCompanyEvent(),
        tonyDevVotes(),
        maryDevVotes(),
        kentDevVotes(),
        martinDevVotes(),
        enableVotingEventFlow(),
    )
    .subscribe(
        null,
        err => {
            cachedDb.client.close();
            console.error(err);
        },
        () => {
            cachedDb.client.close();
        },
    );

function cleanDb() {
    return pipe(
        concatMap(() =>
            mongodbService(cachedDb, ServiceNames.cancelVotingEvent, { name: companyEvent.name, hard: true }),
        ),
        concatMap(() =>
            mongodbService(cachedDb, ServiceNames.cancelVotingEvent, { name: communityEvent.name, hard: true }),
        ),
    );
}

function createInitiative() {
    return pipe(concatMap(() => mongodbService(cachedDb, ServiceNames.createInitiative, { name: initiative.name })));
}

function createSmartCompanyEvent() {
    let eventId: string;
    companyEvent.initiativeName = initiative.name;
    return pipe(
        tap((inititiaveId: any) => (companyEvent.initiativeId = inititiaveId.toHexString())),
        concatMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, companyEvent)),
        tap(id => (eventId = id.toHexString())),
        concatMap(() => readCsvLineObs$(`${__dirname}/technologies.csv`).pipe(toArray())),
        concatMap((technologies: any[]) =>
            mongodbService(cachedDb, ServiceNames.setTechologiesForEvent, { _id: eventId, technologies }),
        ),
        concatMap(() => mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: eventId })),
        map(() => eventId),
    );
}

function tonyDevVotes() {
    return pipe(
        concatMap((_id: string) => mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id })),
        concatMap((votingEvent: VotingEvent) => {
            const tech0 = getTechToVote(votingEvent, 0);
            const tech1 = getTechToVote(votingEvent, 1);
            const votes: VoteCredentialized = {
                credentials: getVoteCredentials(votingEvent, tony_dev),
                votes: [
                    {
                        technology: tech0,
                        ring: 'adopt',
                        eventRound: 1,
                        comment: { text: 'Awesome' },
                        tags: [CORPORATE_VOTING_EVENT_TAGS[0], CORPORATE_VOTING_EVENT_TAGS[1]],
                    },
                    {
                        technology: tech1,
                        ring: 'hold',
                        eventRound: 1,
                        comment: { text: 'Crap, Garbage' },
                        tags: [CORPORATE_VOTING_EVENT_TAGS[0], CORPORATE_VOTING_EVENT_TAGS[2]],
                    },
                ],
            };
            return mongodbService(cachedDb, ServiceNames.saveVotes, votes).pipe(map(() => votingEvent._id));
        }),
    );
}
function maryDevVotes() {
    return pipe(
        concatMap((_id: string) => mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id })),
        concatMap((votingEvent: VotingEvent) => {
            const tech0 = getTechToVote(votingEvent, 0);
            const tech1 = getTechToVote(votingEvent, 1);
            const votes: VoteCredentialized = {
                credentials: getVoteCredentials(votingEvent, mary_dev),
                votes: [
                    {
                        technology: tech0,
                        ring: 'hold',
                        eventRound: 1,
                        comment: { text: 'Really bad' },
                        tags: [CORPORATE_VOTING_EVENT_TAGS[2], CORPORATE_VOTING_EVENT_TAGS[1]],
                    },
                    {
                        technology: tech1,
                        ring: 'adopt',
                        eventRound: 1,
                        comment: { text: 'Wonderful' },
                        tags: [CORPORATE_VOTING_EVENT_TAGS[0], CORPORATE_VOTING_EVENT_TAGS[1]],
                    },
                ],
            };
            return mongodbService(cachedDb, ServiceNames.saveVotes, votes).pipe(map(() => votingEvent._id));
        }),
    );
}
function kentDevVotes() {
    return pipe(
        concatMap((_id: string) => mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id })),
        concatMap((votingEvent: VotingEvent) => {
            const tech0 = getTechToVote(votingEvent, 0);
            const tech1 = getTechToVote(votingEvent, 1);
            const tech3 = getTechToVote(votingEvent, 3);
            const votes: VoteCredentialized = {
                credentials: getVoteCredentials(votingEvent, kent_dev),
                votes: [
                    {
                        technology: tech0,
                        ring: 'trial',
                        eventRound: 1,
                        comment: { text: 'Sorta try' },
                        tags: [CORPORATE_VOTING_EVENT_TAGS[1], CORPORATE_VOTING_EVENT_TAGS[3]],
                    },
                    {
                        technology: tech1,
                        ring: 'assess',
                        eventRound: 1,
                        comment: { text: 'Sounds pretty cool' },
                        tags: [CORPORATE_VOTING_EVENT_TAGS[4], CORPORATE_VOTING_EVENT_TAGS[1]],
                    },
                    {
                        technology: tech3,
                        ring: 'adopt',
                        eventRound: 1,
                        comment: { text: 'life changer' },
                        tags: [CORPORATE_VOTING_EVENT_TAGS[0], CORPORATE_VOTING_EVENT_TAGS[1]],
                    },
                ],
            };
            return mongodbService(cachedDb, ServiceNames.saveVotes, votes).pipe(map(() => votingEvent._id));
        }),
    );
}
function martinDevVotes() {
    return pipe(
        concatMap((_id: string) => mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id })),
        concatMap((votingEvent: VotingEvent) => {
            const tech0 = getTechToVote(votingEvent, 0);
            const tech1 = getTechToVote(votingEvent, 1);
            const tech3 = getTechToVote(votingEvent, 3);
            const votes: VoteCredentialized = {
                credentials: getVoteCredentials(votingEvent, martin_dev),
                votes: [
                    {
                        technology: tech0,
                        ring: 'assess',
                        eventRound: 1,
                        comment: { text: 'Sorta try' },
                        tags: [CORPORATE_VOTING_EVENT_TAGS[1], CORPORATE_VOTING_EVENT_TAGS[3]],
                    },
                    {
                        technology: tech1,
                        ring: 'trial',
                        eventRound: 1,
                        comment: { text: 'Well ... you know ...' },
                        tags: [CORPORATE_VOTING_EVENT_TAGS[4], CORPORATE_VOTING_EVENT_TAGS[1]],
                    },
                    {
                        technology: tech3,
                        ring: 'adopt',
                        eventRound: 1,
                        comment: { text: 'has actually improved stuff' },
                        tags: [
                            CORPORATE_VOTING_EVENT_TAGS[0],
                            CORPORATE_VOTING_EVENT_TAGS[2],
                            CORPORATE_VOTING_EVENT_TAGS[1],
                        ],
                    },
                ],
            };
            return mongodbService(cachedDb, ServiceNames.saveVotes, votes).pipe(map(() => votingEvent._id));
        }),
    );
}

function getTechToVote(votingEvent: VotingEvent, techIndex: number) {
    const tech = { ...votingEvent.technologies[techIndex] };
    tech._id = (tech._id as any).toHexString();
    return tech;
}

function getVoteCredentials(votingEvent: VotingEvent, voter: Credentials) {
    const eventName = votingEvent.name;
    const eventId = votingEvent._id.toHexString();
    return { votingEvent: { name: eventName, _id: eventId, round: 1 }, voterId: voter };
}

function enableVotingEventFlow() {
    return pipe(
        concatMap(() =>
            updateOneObs(
                { user: { $exists: false } },
                { 'config.enableVotingEventFlow': true },
                cachedDb.db.collection(config.configurationCollection),
                { upsert: true },
            ),
        ),
    );
}
