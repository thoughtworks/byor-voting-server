import { concatMap, map, toArray, tap } from 'rxjs/operators';
import { mongodbService, CachedDB } from '../../../api/service';
import { config } from '../../../api/config';
import { ObjectId } from 'mongodb';
import { connectObs, updateOneObs } from 'observable-mongo';
import { ServiceNames } from '../../../service-names';
import { VotingEvent } from '../../../model/voting-event';
import {
    CorporateVotingEventFlow,
    CORPORATE_VOTING_EVENT_TAGS,
} from '../../../voting-event-flow-templates/corporate-voting-event-flow';
// import { CommunityVotingEventFlow } from '../../../voting-event-flow-templates/community-voting-event-flow';
import { Credentials } from '../../../model/credentials';
import { VoteCredentialized } from '../../../model/vote-credentialized';
import { Initiative } from '../../../model/initiative';
import { readCsvLineObs$ } from '../../../lib/observables';
import { User } from '../../../model/user';
import { createHeaders } from '../../test.utils';

const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

const initiative: Initiative = { name: 'Tech Radar for the Smart Company' };
const initiativeFirstAdministrator: User = { user: 'init_admin@smart.com' };
const initiativeFirstAdministratorPwd = 'adminPwd';
const initiativeOtherAdministrators = [
    { user: 'jackie@smart.com' },
    { user: 'jack@smart.com' },
    initiativeFirstAdministrator, // repeated - should neither generate errors nor create a new user
];

const companyEvent: VotingEvent = {
    name: 'The Smart Company Tech Radar',
    flow: CorporateVotingEventFlow,
    owner: initiativeFirstAdministrator,
};
// const communityEvent: VotingEvent = {
//     name: 'A Radar the Smart Company organizes for a Community Event',
//     flow: CommunityVotingEventFlow,
//     owner: { userId: 'the setupper' },
// };

const tony_dev: Credentials = { nickname: 'Tony the Dev' };
const mary_dev: Credentials = { nickname: 'Mary the mighty Dev' };
const kent_dev: Credentials = { nickname: 'Kent the old dev' };
const martin_dev: Credentials = { nickname: 'Martin the shy dev' };

const initializeConn = (dbName: string) => {
    return connectObs(config.mongoUri).pipe(
        tap(_client => (cachedDb.client = _client)),
        tap(_client => (cachedDb.db = _client.db(dbName))),
    );
};

initializeConn(cachedDb.dbName)
    .pipe(
        concatMap(() => cleanDb()),
        concatMap(() => createInitiative()),
        concatMap(initiativeId => authenticateInitiativeAdministrator(initiativeId)),
        concatMap(({ headers, initiativeId }) => {
            return loadAdministratorsForInitiative({ headers, initiativeId });
        }),
        concatMap(({ headers, initiativeId }) => {
            return createSmartCompanyEvent({ headers, initiativeId });
        }),
        concatMap(eventId => loadTechnologiesForVotingEvent(eventId)),
        concatMap(eventId => openVotingEvent(eventId)),
        concatMap(eventId => tonyDevVotes(eventId)),
        concatMap(eventId => maryDevVotes(eventId)),
        concatMap(eventId => kentDevVotes(eventId)),
        concatMap(eventId => martinDevVotes(eventId)),
        concatMap(() => enableVotingEventFlow()),
    )
    .subscribe(
        null,
        err => {
            cachedDb.client.close();
            console.log('client>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>', cachedDb.client);
            console.error(err);
        },
        () => {
            cachedDb.client.close();
            console.log('DONE');
        },
    );

function cleanDb() {
    return mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiative.name, hard: true });
}

function createInitiative() {
    return mongodbService(cachedDb, ServiceNames.createInitiative, {
        name: initiative.name,
        administrator: initiativeFirstAdministrator,
    }).pipe(map((initiativeId: ObjectId) => initiativeId));
}

function authenticateInitiativeAdministrator(initiativeId: ObjectId) {
    return mongodbService(cachedDb, ServiceNames.authenticateOrSetPwdIfFirstTime, {
        user: initiativeFirstAdministrator.user,
        pwd: initiativeFirstAdministratorPwd,
    }).pipe(
        map(data => {
            return createHeaders(data.token);
        }),
        map(headers => ({ headers, initiativeId })),
    );
}
function loadAdministratorsForInitiative({
    headers,
    initiativeId,
}: {
    headers: {
        authorization: string;
    };
    initiativeId: ObjectId;
}) {
    return mongodbService(
        cachedDb,
        ServiceNames.loadAdministratorsForInitiative,
        {
            name: initiative.name,
            _id: initiativeId.toHexString(),
            administrators: initiativeOtherAdministrators.map(u => u.user),
        },
        null,
        headers,
    ).pipe(map(() => ({ headers, initiativeId })));
}
function createSmartCompanyEvent({
    headers,
    initiativeId,
}: {
    headers: {
        authorization: string;
    };
    initiativeId: ObjectId;
}) {
    companyEvent.initiativeName = initiative.name;
    companyEvent.initiativeId = initiativeId.toHexString();
    return mongodbService(cachedDb, ServiceNames.createVotingEvent, companyEvent, null, headers);
}
function loadTechnologiesForVotingEvent(eventId: ObjectId) {
    let _eventId = eventId.toHexString();
    return readCsvLineObs$(`${__dirname}/technologies.csv`)
        .pipe(toArray())
        .pipe(
            concatMap((technologies: any[]) =>
                mongodbService(cachedDb, ServiceNames.setTechologiesForEvent, { _id: _eventId, technologies }),
            ),
            map(() => eventId),
        );
}
// function loadUsersForVotingEvent() {
//     let eventId: string;
//     return pipe(
//         tap((id: string) => {
//             eventId = id;
//         }),
//         map(() => eventId),
//     );
// }
function openVotingEvent(eventId: ObjectId) {
    return mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: eventId }).pipe(
        map(() => eventId.toHexString()),
    );
}

function tonyDevVotes(eventId: string) {
    return mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id: eventId }).pipe(
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
            return mongodbService(cachedDb, ServiceNames.saveVotes, votes).pipe(map(() => eventId));
        }),
    );
}
function maryDevVotes(eventId: string) {
    return mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id: eventId }).pipe(
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
            return mongodbService(cachedDb, ServiceNames.saveVotes, votes).pipe(map(() => eventId));
        }),
    );
}
function kentDevVotes(eventId: string) {
    return mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id: eventId }).pipe(
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
            return mongodbService(cachedDb, ServiceNames.saveVotes, votes).pipe(map(() => eventId));
        }),
    );
}
function martinDevVotes(eventId: string) {
    return mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id: eventId }).pipe(
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
            return mongodbService(cachedDb, ServiceNames.saveVotes, votes).pipe(map(() => eventId));
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
    return updateOneObs(
        { user: { $exists: false } },
        { 'config.enableVotingEventFlow': true },
        cachedDb.db.collection(config.configurationCollection),
        { upsert: true },
    );
}
