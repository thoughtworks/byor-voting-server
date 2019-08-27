import { expect } from 'chai';
import { switchMap, map, tap, catchError, concatMap } from 'rxjs/operators';
import { forkJoin, of } from 'rxjs';
import { mongodbService, CachedDB } from '../api/service';
import { getAllVotingEvents } from '../api/voting-event-apis';
import { getAllVotes } from '../api/votes-apis';
import { config } from '../api/config';
import { ServiceNames } from '../service-names';
import { ERRORS } from '../api/errors';
import { TEST_TECHNOLOGIES } from '../model/technologies.local-data';
import { VoteCredentialized } from '../model/vote-credentialized';
import { VotingEvent } from '../model/voting-event';
import { cleanVotingEventsAndVotesCollections } from './base.spec';
import { Technology, Recommendation } from '../model/technology';
import { logError } from '../lib/utils';
import { ObjectId } from 'bson';
import { Comment } from '../model/comment';
import { Vote } from '../model/vote';
import { User } from '../model/user';
import {
    authenticateForTest,
    createVotingEventForTest,
    readInitiative,
    readVotingEvent,
    createVotingEventForVotingEventTest,
    createVotingEventForVotingEventAndReturnHeaders,
    cancelAndCreateInitiative,
    createAndOpenVotingEvent,
    cancelVotingEvent,
} from './test.utils';
import { Initiative } from '../model/initiative';
import { addUsers, findJustOneUserObs } from '../api/authentication-api';

describe('Operations on votingevents collection', () => {
    it('1.0 create a voting event and then reads it', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const newVotingEventName = 'A Voting Event';

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createVotingEventForVotingEventTest(cachedDb, newVotingEventName)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvents)),
            )
            .subscribe(
                votingEvents => {
                    expect(votingEvents.length).to.equal(1);
                    expect(votingEvents[0].name).to.equal(newVotingEventName);
                    expect(votingEvents[0].creationTS).to.be.not.undefined;
                    expect(votingEvents[0].lastOpenedTS).to.be.undefined;
                    expect(votingEvents[0].lastClosedTS).to.be.undefined;
                },
                err => {
                    cachedDb.client.close();
                    logError(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('1.1 create a voting event and then tries to create a second one with the same name', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const newVotingEventName = 'A Doubled Event 2';
        const initiativeName = `Test initiative for VotingEvent ${newVotingEventName}`;
        const initiativeAdmin = { user: `Admin for initiative ${initiativeName}` };
        let initiative: Initiative;
        let headers: {
            authorization: string;
        };

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                concatMap(() => cancelAndCreateInitiative(cachedDb, initiativeName, initiativeAdmin, true)),
                concatMap(() => readInitiative(cachedDb, initiativeName)),
                tap(_initiative => (initiative = _initiative)),
                concatMap(() => authenticateForTest(cachedDb, initiativeAdmin.user, 'my password')),
                tap(_headers => (headers = _headers)),
                concatMap(() =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.createVotingEvent,
                        {
                            newVotingEventName,
                            initiativeName,
                            initiativeId: initiative._id,
                        },
                        null,
                        headers,
                    ),
                ),
                concatMap(() =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.createVotingEvent,
                        {
                            newVotingEventName,
                            initiativeName,
                            initiativeId: initiative._id,
                        },
                        null,
                        headers,
                    ),
                ),
            )
            .subscribe(
                null,
                err => {
                    expect(err.mongoErrorCode).to.equal(ERRORS.votingEventAlreadyPresent.mongoErrorCode);
                    cachedDb.client.close();
                    done();
                },
                () => {
                    const errorMessage = 'It should have raised an error';
                    logError(errorMessage);
                    cachedDb.client.close();
                    done(errorMessage);
                },
            );
    }).timeout(10000);

    it('1.2 open a voting event', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const newVotingEventName = 'A an Event to open';

        let votingEventId;
        let headers;

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createVotingEventForVotingEventAndReturnHeaders(cachedDb, newVotingEventName)),
                tap(data => {
                    votingEventId = data.votingEventId;
                    headers = data.headers;
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvents)),
                tap(votingEvents => {
                    const votingEvent = votingEvents[0];
                    expect(votingEvent.round).to.be.undefined;
                }),
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId }, null, headers),
                ),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvents)),
            )
            .subscribe(
                votingEvents => {
                    expect(votingEvents[0].status).to.equal('open');
                    expect(votingEvents[0].lastOpenedTS).to.be.not.undefined;
                    expect(votingEvents[0].lastClosedTS).to.be.undefined;
                    expect(votingEvents[0].round).to.be.not.undefined;
                },
                err => {
                    cachedDb.client.close();
                    logError(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('1.3 close a voting event', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const newVotingEventName = 'A an Event to close';

        let votingEventId;
        let headers;
        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createVotingEventForVotingEventAndReturnHeaders(cachedDb, newVotingEventName)),
                tap(data => {
                    votingEventId = data.votingEventId;
                    headers = data.headers;
                }),
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId }, null, headers),
                ),
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.closeVotingEvent, { _id: votingEventId }, null, headers),
                ),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvents)),
            )
            .subscribe(
                votingEvents => {
                    expect(votingEvents[0].status).to.equal('closed');
                    expect(votingEvents[0].lastOpenedTS).to.be.not.undefined;
                    expect(votingEvents[0].lastClosedTS).to.be.not.undefined;
                },
                err => {
                    cachedDb.client.close();
                    logError(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('1.4 removes "hard" a voting event HARD', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const newVotingEventName = 'An event to remove hard';

        let cancelHardVotingEventParams;
        let credentializedVote: VoteCredentialized;

        let votingEventId;
        let headers;
        let newVotingEvent;
        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createVotingEventForVotingEventAndReturnHeaders(cachedDb, newVotingEventName)),
                tap(data => {
                    votingEventId = data.votingEventId;
                    headers = data.headers;
                }),
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId }, null, headers),
                ),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap(vEvent => {
                    newVotingEvent = vEvent;
                    credentializedVote = {
                        credentials: { votingEvent: vEvent, voterId: { firstName: 'one', lastName: 'two' } },
                        votes: [
                            {
                                ring: 'hold',
                                technology: TEST_TECHNOLOGIES[0],
                                eventName: vEvent.name,
                                eventId: vEvent._id,
                                eventRound: 1,
                            },
                        ],
                    };
                    cancelHardVotingEventParams = { ...vEvent, hard: true };
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.saveVotes, credentializedVote)),
                switchMap(() =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.cancelVotingEvent,
                        cancelHardVotingEventParams,
                        null,
                        headers,
                    ),
                ),
                switchMap(() =>
                    forkJoin(
                        getAllVotingEvents(cachedDb.db.collection(config.votingEventsCollection)),
                        getAllVotes(cachedDb.db.collection(config.votesCollection)),
                    ),
                ),
            )
            .subscribe(
                ([votingEvents, votes]) => {
                    expect(votingEvents.length).to.equal(0);
                    expect(votes.filter(vote => vote.eventId === newVotingEvent._id).length).to.equal(0);
                },
                err => {
                    cachedDb.client.close();
                    logError(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('1.4.1 removes "hard" a voting event', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const eventName = 'A second event to remove hard';

        let credentializedVote: VoteCredentialized;

        let votingEventId;
        let headers;
        let newVotingEvent;
        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createVotingEventForVotingEventAndReturnHeaders(cachedDb, eventName)),
                tap(data => {
                    votingEventId = data.votingEventId;
                    headers = data.headers;
                }),
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId }, null, headers),
                ),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap(vEvent => {
                    newVotingEvent = vEvent;
                    credentializedVote = {
                        credentials: { votingEvent: newVotingEvent, voterId: { firstName: 'one', lastName: 'two' } },
                        votes: [
                            {
                                ring: 'hold',
                                technology: TEST_TECHNOLOGIES[0],
                                eventName: newVotingEvent.name,
                                eventId: newVotingEvent._id,
                                eventRound: 1,
                            },
                        ],
                    };
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.saveVotes, credentializedVote)),
                switchMap(() =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.cancelVotingEvent,
                        { _id: votingEventId, hard: true },
                        null,
                        headers,
                    ),
                ),
                switchMap(() =>
                    forkJoin(
                        getAllVotingEvents(cachedDb.db.collection(config.votingEventsCollection)),
                        getAllVotes(cachedDb.db.collection(config.votesCollection)),
                    ),
                ),
            )
            .subscribe(
                ([votingEvents, votes]) => {
                    expect(votingEvents.length).to.equal(0);
                    expect(votes.filter(vote => vote.eventId === newVotingEvent._id).length).to.equal(0);
                },
                err => {
                    cachedDb.client.close();
                    logError(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('1.5 removes "soft" a voting event', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const eventName = 'An event to remove soft';

        let cancelSoftVotingEvent;
        let credentializedVote: VoteCredentialized;

        let votingEventId;
        let headers;
        let newVotingEvent;
        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createVotingEventForVotingEventAndReturnHeaders(cachedDb, eventName)),
                tap(data => {
                    votingEventId = data.votingEventId;
                    headers = data.headers;
                }),
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId }, null, headers),
                ),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap(vEvent => {
                    newVotingEvent = vEvent;
                    cancelSoftVotingEvent = newVotingEvent;
                    credentializedVote = {
                        credentials: { votingEvent: newVotingEvent, voterId: { firstName: 'one', lastName: 'two' } },
                        votes: [
                            {
                                ring: 'hold',
                                technology: TEST_TECHNOLOGIES[0],
                                eventName: newVotingEvent.name,
                                eventId: newVotingEvent._id,
                                eventRound: 1,
                            },
                        ],
                    };
                }),

                switchMap(() => mongodbService(cachedDb, ServiceNames.saveVotes, credentializedVote)),
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.cancelVotingEvent, cancelSoftVotingEvent, null, headers),
                ),
                switchMap(() =>
                    forkJoin(
                        mongodbService(cachedDb, ServiceNames.getVotingEvents),
                        mongodbService(cachedDb, ServiceNames.getVotes),
                        getAllVotingEvents(cachedDb.db.collection(config.votingEventsCollection)),
                        getAllVotes(cachedDb.db.collection(config.votesCollection)),
                    ),
                ),
            )
            .subscribe(
                ([votingEvents, votes, allVotingEvents, allVotes]) => {
                    expect(votingEvents.length).to.equal(0);
                    expect(votes.length).to.equal(0);
                    expect(allVotingEvents.length).to.equal(1);

                    const votesOnNewEvent = allVotes.filter(vote => vote.eventId === newVotingEvent._id.toHexString());
                    expect(votesOnNewEvent.length).to.equal(1);
                },
                err => {
                    cachedDb.client.close();
                    logError(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('1.6 creates 2 voting events and then reads one', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const newVotingEventName1 = 'A Voting Event - 1';
        const newVotingEventName2 = 'A Voting Event - 2';

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createVotingEventForVotingEventTest(cachedDb, newVotingEventName1)),
                switchMap(() => createVotingEventForVotingEventTest(cachedDb, newVotingEventName2)),
                switchMap(id => mongodbService(cachedDb, ServiceNames.getVotingEvent, id)),
            )
            .subscribe(
                votingEvent => {
                    expect(votingEvent.name).to.equal(newVotingEventName2);
                    expect(votingEvent.creationTS).to.be.not.undefined;
                    expect(votingEvent.lastOpenedTS).to.be.undefined;
                    expect(votingEvent.lastClosedTS).to.be.undefined;
                },
                err => {
                    cachedDb.client.close();
                    logError(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('1.7 creates a voting event, saves some votes and then calculates the winner', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        const votingEventName = 'event A-winner';
        let votingEvent;

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createVotingEventForVotingEventTest(cachedDb, votingEventName)),
                switchMap(id => mongodbService(cachedDb, ServiceNames.getVotingEvent, id)),
                // JSON stringify and parse to simulate what is received and then returned by the client
                // basically it turns the '_id' of the Voting Event from a mongo ObjectId into a string
                map(event => {
                    return JSON.stringify(event);
                }),
                // map(event => JSON.stringify(event)),
                map(event => {
                    return JSON.parse(event);
                }),
                // map(event => JSON.parse(event)),
                map(_votingEvent => {
                    votingEvent = _votingEvent;
                    const votes: VoteCredentialized[] = [
                        {
                            credentials: {
                                votingEvent: votingEvent,
                                voterId: { firstName: 'one A', lastName: 'two A' },
                            },
                            votes: [{ ring: 'hold', technology: TEST_TECHNOLOGIES[0], eventRound: 1 }],
                        },
                        {
                            credentials: {
                                votingEvent: votingEvent,
                                voterId: { firstName: 'three A', lastName: 'four A' },
                            },
                            votes: [{ ring: 'hold', technology: TEST_TECHNOLOGIES[0], eventRound: 1 }],
                        },
                        {
                            credentials: {
                                votingEvent: votingEvent,
                                voterId: { firstName: 'five A', lastName: 'six A' },
                            },
                            votes: [{ ring: 'hold', technology: TEST_TECHNOLOGIES[0], eventRound: 1 }],
                        },
                        {
                            credentials: {
                                votingEvent: votingEvent,
                                voterId: { firstName: 'seven A', lastName: 'eight A' },
                            },
                            votes: [{ ring: 'assess', technology: TEST_TECHNOLOGIES[1], eventRound: 1 }],
                        },
                    ];
                    return votes;
                }),
                switchMap(votes => forkJoin(votes.map(vote => mongodbService(cachedDb, ServiceNames.saveVotes, vote)))),
                switchMap(() => mongodbService(cachedDb, ServiceNames.calculateWinner, { votingEvent })),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEvent._id)),
                map(votingEvent => votingEvent.winner),
            )
            .subscribe(
                (winner: any) => {
                    expect(winner).to.be.not.undefined;
                    expect(winner.firstName).to.be.not.undefined;
                    expect(winner.lastName).to.be.not.undefined;
                },
                err => {
                    cachedDb.client.close();
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('1.8 creates a voting event, saves some votes and then gets the list of voters', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        const votingEventName = 'event A-winner';
        let votingEvent;

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createVotingEventForVotingEventTest(cachedDb, votingEventName)),
                switchMap(id => mongodbService(cachedDb, ServiceNames.getVotingEvent, id)),
                // JSON stringify and parse to simulate what is received and then returned by the client
                // basically it turns the '_id' of the Voting Event from a mongo ObjectId into a string
                map(event => {
                    return JSON.stringify(event);
                }),
                // map(event => JSON.stringify(event)),
                map(event => {
                    return JSON.parse(event);
                }),
                // map(event => JSON.parse(event)),
                map(_votingEvent => {
                    votingEvent = _votingEvent;
                    const votes: VoteCredentialized[] = [
                        {
                            credentials: {
                                votingEvent: votingEvent,
                                voterId: { firstName: 'one 1', lastName: 'two 2' },
                            },
                            votes: [{ ring: 'hold', technology: TEST_TECHNOLOGIES[0], eventRound: 1 }],
                        },
                        {
                            credentials: {
                                votingEvent: votingEvent,
                                voterId: { firstName: 'one 1', lastName: 'two 2' },
                            },
                            votes: [{ ring: 'hold', technology: TEST_TECHNOLOGIES[1], eventRound: 1 }],
                        },
                        {
                            credentials: {
                                votingEvent: votingEvent,
                                voterId: { firstName: 'three 3', lastName: 'four 4' },
                            },
                            votes: [{ ring: 'hold', technology: TEST_TECHNOLOGIES[0], eventRound: 1 }],
                        },
                        {
                            credentials: {
                                votingEvent: votingEvent,
                                voterId: { firstName: 'three 3', lastName: 'four 4' },
                            },
                            votes: [{ ring: 'assess', technology: TEST_TECHNOLOGIES[1], eventRound: 1 }],
                        },
                    ];
                    return votes;
                }),
                switchMap(votes => forkJoin(votes.map(vote => mongodbService(cachedDb, ServiceNames.saveVotes, vote)))),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVoters, { votingEvent })),
            )
            .subscribe(
                voters => {
                    expect(voters.length).to.equal(2);
                },
                err => {
                    cachedDb.client.close();
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('1.9 creates a voting event and then opens it for revote and then closes it for revote', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        const votingEventName = 'event revote';

        let votingEventId;
        let headers;
        let round;

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createVotingEventForVotingEventAndReturnHeaders(cachedDb, votingEventName)),
                tap(data => {
                    votingEventId = data.votingEventId;
                    headers = data.headers;
                }),
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId }, null, headers),
                ),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap(votingEvent => {
                    round = votingEvent.round;
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap(event => {
                    expect(event.openForRevote).to.be.undefined;
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.openForRevote, { _id: votingEventId, round })),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap(event => {
                    expect(event.openForRevote).to.be.true;
                }),
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.closeForRevote, { _id: votingEventId }, null, headers),
                ),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
            )
            .subscribe(
                (event: VotingEvent) => {
                    expect(event.openForRevote).to.be.false;
                },
                err => {
                    cachedDb.client.close();
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(30000);

    it(`2.0 creates a voting event, saves some votes, calculates the blips, and then retrieves the voting events 
         first in a skinny mode and then with all details of blips and technologies`, done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        const votingEventName = 'event Skinny and Fat';
        let votingEvent;

        let votingEventId;
        let headers;
        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createVotingEventForVotingEventAndReturnHeaders(cachedDb, votingEventName)),
                tap(data => {
                    votingEventId = data.votingEventId;
                    headers = data.headers;
                }),
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId }, null, headers),
                ),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                map(_votingEvent => {
                    votingEvent = _votingEvent;
                    const votes: VoteCredentialized[] = [
                        {
                            credentials: {
                                votingEvent: votingEvent,
                                voterId: { firstName: 'one 1', lastName: 'two 2' },
                            },
                            votes: [
                                { ring: 'hold', technology: TEST_TECHNOLOGIES[0], eventRound: 1 },
                                { ring: 'hold', technology: TEST_TECHNOLOGIES[1], eventRound: 1 },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent: votingEvent,
                                voterId: { firstName: 'three 3', lastName: 'four 4' },
                            },
                            votes: [
                                { ring: 'hold', technology: TEST_TECHNOLOGIES[0], eventRound: 1 },
                                { ring: 'assess', technology: TEST_TECHNOLOGIES[1], eventRound: 1 },
                            ],
                        },
                    ];
                    return votes;
                }),
                switchMap(votes => forkJoin(votes.map(vote => mongodbService(cachedDb, ServiceNames.saveVotes, vote)))),
                switchMap(() => mongodbService(cachedDb, ServiceNames.calculateBlips, { votingEvent })),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvents)),
                map(events => events[0]),
                tap(event => {
                    expect(event.technologies).to.be.undefined;
                    expect(event.blips).to.be.undefined;
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvents, { full: true })),
                map(events => events[0]),
            )
            .subscribe(
                (event: any) => {
                    expect(event.technologies).to.be.not.undefined;
                    expect(event.blips).to.be.not.undefined;
                },
                err => {
                    cachedDb.client.close();
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(30000);

    it(`2.1 creates a voting event, add one technology, then try to add once more`, done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        const votingEventName = 'event with changing technologies';
        const newTech: Technology = {
            name: 'the new cool tech',
            description: 'I am a new cool tech',
            isNew: true,
            quadrant: 'tools',
        };

        let votingEventId;
        let headers;
        mongodbService(cachedDb, ServiceNames.getVotingEvents)
            .pipe(
                map(votingEvents => votingEvents.filter(ve => ve.name === votingEventName)),
                switchMap(votingEvents => {
                    const votingEventsDeleteObs = votingEvents.map(ve => cancelVotingEvent(cachedDb, ve._id, true));
                    return votingEvents.length > 0 ? forkJoin(votingEventsDeleteObs) : of(null);
                }),
                switchMap(() => createVotingEventForVotingEventAndReturnHeaders(cachedDb, votingEventName)),
                tap(data => {
                    votingEventId = data.votingEventId;
                    headers = data.headers;
                }),
                switchMap(() =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.openVotingEvent,
                        { _id: votingEventId, round: 1 },
                        null,
                        headers,
                    ),
                ),
                // open the even to load the technologies - currently technologies are loaded into the event when the event is opened
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.addNewTechnologyToEvent, {
                        _id: votingEventId,
                        technology: newTech,
                    }),
                ),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap(event => {
                    const techs = event.technologies.filter(t => t.name === newTech.name);
                    expect(techs.length).to.equal(1);
                    expect(techs[0]._id).to.be.not.undefined;
                }),
                // add again the same technology
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.addNewTechnologyToEvent, {
                        _id: votingEventId,
                        technology: newTech,
                    }),
                ),
                catchError(err => {
                    expect(err.errorCode).to.equal(ERRORS.techPresentInVotingEvent.errorCode);
                    return of(null);
                }),
                // try to add a technology to a non existing voting event
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.addNewTechnologyToEvent, {
                        _id: 123456789012,
                        technology: newTech,
                    }),
                ),
                catchError(err => {
                    expect(err.errorCode).to.equal(ERRORS.votingEventNotExisting.errorCode);
                    return of(null);
                }),
            )
            .subscribe(
                null,
                err => {
                    cachedDb.client.close();
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(30000);

    it(`2.2 add  comment to a technology which has no comments and then add a second one
    and then adds a reply to the second comment`, done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        const votingEventName = 'event with a tech without comments';
        const newTech: Technology = {
            name: 'tech with no comment',
            description: 'I am a new cool tech with no comment',
            isNew: true,
            quadrant: 'tools',
        };
        const firstCommentText = 'I am the first comment for tech';
        const secondCommentText = 'I am the second comment for tech';
        const replyToSecondComment = 'i am the reply to the second comment';

        let votingEventId;
        let headers;
        let technology: Technology;
        let techId: string;
        mongodbService(cachedDb, ServiceNames.getVotingEvents)
            .pipe(
                map(votingEvents => votingEvents.filter(ve => ve.name === votingEventName)),
                switchMap(votingEvents => {
                    const votingEventsDeleteObs = votingEvents.map(ve => cancelVotingEvent(cachedDb, ve._id, true));
                    return votingEvents.length > 0 ? forkJoin(votingEventsDeleteObs) : of(null);
                }),
                switchMap(() => createVotingEventForVotingEventAndReturnHeaders(cachedDb, votingEventName)),
                tap(data => {
                    votingEventId = data.votingEventId;
                    headers = data.headers;
                }),
                // open the even to load the technologies - currently technologies are loaded into the event when the event is opened
                switchMap(() =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.openVotingEvent,
                        { _id: votingEventId, round: 1 },
                        null,
                        headers,
                    ),
                ),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.addNewTechnologyToEvent, {
                        _id: votingEventId,
                        technology: newTech,
                    }),
                ),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap((event: VotingEvent) => {
                    technology = event.technologies.find(t => t.name === newTech.name);
                    const tId = technology._id as ObjectId;
                    techId = tId.toHexString();
                }),
                // add a first comment to the technology
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.addCommentToTech, {
                        _id: votingEventId,
                        technologyId: techId,
                        comment: firstCommentText,
                    }),
                ),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap((event: VotingEvent) => {
                    technology = event.technologies.find(t => t.name === newTech.name);
                    expect(technology.comments).to.be.not.undefined;
                    expect(technology.comments.length).to.equal(1);
                    expect(technology.comments[0].text).to.equal(firstCommentText);
                    expect(technology.comments[0].author).to.be.null; // the author is null since we have not authenticated the user in this test
                    expect(technology.comments[0].id).to.be.not.undefined;
                    expect(technology.comments[0].timestamp).to.be.not.undefined;
                    expect(technology.comments[0].replies).to.be.undefined;
                }),

                // add a second comment to the technology
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.addCommentToTech, {
                        _id: votingEventId,
                        technologyId: techId,
                        comment: secondCommentText,
                    }),
                ),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                map((event: VotingEvent) => event.technologies.find(t => t.name === newTech.name)),
                tap((technology: Technology) => {
                    const comments = technology.comments;
                    expect(comments).to.be.not.undefined;
                    expect(comments.length).to.equal(2);
                    expect(comments[1].text).to.equal(secondCommentText);
                    expect(comments[1].author).to.be.null; // the author is null since we have not authenticated the user in this test
                    expect(comments[1].id).to.be.not.undefined;
                    expect(comments[1].timestamp).to.be.not.undefined;
                    expect(comments[1].replies).to.be.undefined;
                }),

                // add a reply to the second comment added to the technology
                switchMap((technology: Technology) => {
                    const commentId = technology.comments[1].id;
                    const reply: Comment = { text: replyToSecondComment };
                    return mongodbService(cachedDb, ServiceNames.addReplyToTechComment, {
                        votingEventId,
                        technologyId: techId,
                        reply,
                        commentReceivingReplyId: commentId,
                    });
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                map((event: VotingEvent) => event.technologies.find(t => t.name === newTech.name)),
                tap((technology: Technology) => {
                    const comments = technology.comments;
                    expect(comments[1].replies).to.be.not.undefined;
                    const replies = comments[1].replies;
                    expect(replies.length).to.equal(1);
                    expect(replies[0].text).to.equal(replyToSecondComment);
                    expect(replies[0].author).to.be.null; // the author is null since we have not authenticated the user in this test
                    expect(replies[0].id).to.be.not.undefined;
                    expect(replies[0].timestamp).to.be.not.undefined;
                    expect(replies[0].replies).to.be.undefined;
                }),
            )
            .subscribe(
                null,
                err => {
                    cachedDb.client.close();
                    done(err);
                },
                () => {
                    console.log('DONE');
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(30000);

    it(`2.3 try to add a comment to a tech that does not exist in the voting event`, done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        const votingEventName = 'event with no tech for comments';
        const commentText = 'I am the comment for tech not present';
        const theAuthor = 'the author of the comment';

        let votingEventId;
        let headers;
        mongodbService(cachedDb, ServiceNames.getVotingEvents)
            .pipe(
                map(votingEvents => votingEvents.filter(ve => ve.name === votingEventName)),
                switchMap(votingEvents => {
                    const votingEventsDeleteObs = votingEvents.map(ve => cancelVotingEvent(cachedDb, ve._id, true));
                    return votingEvents.length > 0 ? forkJoin(votingEventsDeleteObs) : of(null);
                }),
                switchMap(() => createVotingEventForVotingEventAndReturnHeaders(cachedDb, votingEventName)),
                tap(data => {
                    votingEventId = data.votingEventId;
                    headers = data.headers;
                }),
                // open the even to load the technologies - currently technologies are loaded into the event when the event is opened
                switchMap(() =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.openVotingEvent,
                        { _id: votingEventId, round: 1 },
                        null,
                        headers,
                    ),
                ),
                // add a comment to a technology the is not present in the voting event
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.addCommentToTech, {
                        _id: votingEventId,
                        technologyId: 'i am an id not present in the event',
                        comment: commentText,
                        author: theAuthor,
                    }),
                ),
                catchError(err => {
                    expect(err.errorCode).to.equal(ERRORS.techNotPresentInVotingEvent.errorCode);
                    return of(null);
                }),
            )
            .subscribe(
                null,
                err => {
                    cachedDb.client.close();
                    done(err);
                },
                () => {
                    console.log('DONE');
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(30000);

    it('2.4 after setting the cancelled property to false the VotingEvent should be visible again', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const newVotingEventName = 'An Event with cancelled property set to false';

        let votingEventId: ObjectId;
        let headers;

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createVotingEventForVotingEventAndReturnHeaders(cachedDb, newVotingEventName)),
                tap(data => {
                    votingEventId = data.votingEventId;
                    headers = data.headers;
                }),
                concatMap(() =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.cancelVotingEvent,
                        { _id: votingEventId, hard: false },
                        null,
                        headers,
                    ),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id: votingEventId })),
                tap(votingEvent => {
                    expect(votingEvent).to.be.undefined;
                }),
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.undoCancelVotingEvent, { _id: votingEventId }, null, headers),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id: votingEventId })),
                tap(votingEvent => {
                    expect(votingEvent.name).to.equal(newVotingEventName);
                }),
            )
            .subscribe(
                null,
                err => {
                    cachedDb.client.close();
                    logError(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it(`2.5 A Voting Event is created, people vote and comment, and then we fetch the Event with its techs
    with number of votes and comments`, done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const newVotingEventName = 'An Event with votes and comments to be counted';
        const nickanmeOfFirstVoter = 'I am the first voter';

        let votingEventId;
        let votes: VoteCredentialized[];
        let votingEvent;
        let tech0: Technology;
        let tech1: Technology;

        let headers;

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createVotingEventForVotingEventAndReturnHeaders(cachedDb, newVotingEventName)),
                tap(data => {
                    votingEventId = data.votingEventId;
                    headers = data.headers;
                }),
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId }, null, headers),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap(vEvent => {
                    votingEvent = vEvent;
                    tech0 = votingEvent.technologies[0];
                    tech1 = votingEvent.technologies[1];
                    votes = [
                        {
                            credentials: { votingEvent, voterId: { nickname: nickanmeOfFirstVoter } },
                            votes: [
                                {
                                    ring: 'hold',
                                    technology: tech0,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                    comment: { text: `I am the comment for vote[1] on tech ${tech0.name}` },
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent, voterId: { nickname: 'two A' } },
                            votes: [
                                {
                                    ring: 'hold',
                                    technology: tech0,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                                {
                                    ring: 'assess',
                                    technology: tech1,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                    comment: { text: `I am the comment for vote[1] on tech ${tech1.name}` },
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent, voterId: { nickname: 'five A' } },
                            votes: [
                                {
                                    ring: 'hold',
                                    technology: tech0,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent, voterId: { nickname: 'seven A' } },
                            votes: [
                                {
                                    ring: 'assess',
                                    technology: tech1,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                    ];
                }),
                concatMap(() => forkJoin(votes.map(vote => mongodbService(cachedDb, ServiceNames.saveVotes, vote)))),
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.getVotingEventWithNumberOfCommentsAndVotes, votingEventId),
                ),
                tap((votingEvent: VotingEvent) => {
                    const t0 = votingEvent.technologies.find(t => t.name === tech0.name);
                    const t1 = votingEvent.technologies.find(t => t.name === tech1.name);
                    expect(t0.numberOfVotes).to.equal(3);
                    expect(t1.numberOfVotes).to.equal(2);
                }),
                concatMap(() => {
                    return mongodbService(cachedDb, ServiceNames.getVotes, { eventId: votingEventId });
                }),
                concatMap((votes: Vote[]) => {
                    const theVote = votes.find(
                        v => v.voterId.nickname.toUpperCase() === nickanmeOfFirstVoter.toUpperCase(),
                    );
                    const voteId = theVote._id.toHexString();
                    const commentReceivingReplyId = theVote.comment.id;
                    const reply: Comment = {
                        text: `I am the first reply to a comment on tech ${theVote.technology.name}`,
                    };
                    const params = { voteId, reply, commentReceivingReplyId };
                    return mongodbService(cachedDb, ServiceNames.addReplyToVoteComment, params);
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotes, { eventId: votingEventId })),
                concatMap((votes: Vote[]) => {
                    const theVote = votes.find(
                        v => v.voterId.nickname.toUpperCase() === nickanmeOfFirstVoter.toUpperCase(),
                    );
                    const voteId = theVote._id.toHexString();
                    const replyReceivingReplyId = theVote.comment.replies[0].id;
                    const reply: Comment = {
                        text: `I am the first reply to the first reply to a comment on tech ${theVote.technology.name}`,
                    };
                    const params = { voteId, reply, commentReceivingReplyId: replyReceivingReplyId };
                    return mongodbService(cachedDb, ServiceNames.addReplyToVoteComment, params);
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotes, { eventId: votingEventId })),
                concatMap((votes: Vote[]) => {
                    const theVote = votes.find(
                        v => v.voterId.nickname.toUpperCase() === nickanmeOfFirstVoter.toUpperCase(),
                    );
                    const voteId = theVote._id.toHexString();
                    const replyReceivingReplyId = theVote.comment.replies[0].id;
                    const reply: Comment = {
                        text: `I am the second reply to the first reply to a comment on tech ${
                            theVote.technology.name
                        }`,
                    };
                    const params = { voteId, reply, commentReceivingReplyId: replyReceivingReplyId };
                    return mongodbService(cachedDb, ServiceNames.addReplyToVoteComment, params);
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotes, { eventId: votingEventId })),
                concatMap((votes: Vote[]) => {
                    const theVote = votes.find(
                        v => v.voterId.nickname.toUpperCase() === nickanmeOfFirstVoter.toUpperCase(),
                    );
                    const voteId = theVote._id.toHexString();
                    const replyReceivingReplyId = theVote.comment.replies[0].replies[1].id;
                    const reply: Comment = {
                        text: `I am the first reply to the second reply to the first reply to a comment on tech ${
                            theVote.technology.name
                        }`,
                    };
                    const params = { voteId, reply, commentReceivingReplyId: replyReceivingReplyId };
                    return mongodbService(cachedDb, ServiceNames.addReplyToVoteComment, params);
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotes, { eventId: votingEventId })),
                concatMap((votes: Vote[]) => {
                    const theVote = votes.find(
                        v => v.voterId.nickname.toUpperCase() === nickanmeOfFirstVoter.toUpperCase(),
                    );
                    const voteId = theVote._id.toHexString();
                    const replyReceivingReplyId = theVote.comment.replies[0].replies[1].id;
                    const reply: Comment = {
                        text: `I am the second reply to the second reply to the first reply to a comment on tech ${
                            theVote.technology.name
                        }`,
                    };
                    const params = { voteId, reply, commentReceivingReplyId: replyReceivingReplyId };
                    return mongodbService(cachedDb, ServiceNames.addReplyToVoteComment, params);
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotes, { eventId: votingEventId })),
                concatMap((votes: Vote[]) => {
                    const theVote = votes.find(
                        v => v.voterId.nickname.toUpperCase() === nickanmeOfFirstVoter.toUpperCase(),
                    );
                    const voteId = theVote._id.toHexString();
                    const commentReceivingReplyId = theVote.comment.id;
                    const reply: Comment = {
                        text: `I am the second reply to a comment on tech ${theVote.technology.name}`,
                    };
                    const params = { voteId, reply, commentReceivingReplyId };
                    return mongodbService(cachedDb, ServiceNames.addReplyToVoteComment, params);
                }),
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.getVotingEventWithNumberOfCommentsAndVotes, votingEventId),
                ),
                tap((votingEvent: VotingEvent) => {
                    const t0 = votingEvent.technologies.find(t => t.name === tech0.name);
                    const t1 = votingEvent.technologies.find(t => t.name === tech1.name);
                    expect(t0.numberOfComments).to.equal(7);
                    expect(t1.numberOfComments).to.equal(1);
                }),
            )
            .subscribe(
                null,
                err => {
                    cachedDb.client.close();
                    logError(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it(`2.6 A Voting Event is created, people vote and add tags, and then we move the event 
    to the next step of the VotingEvent flow`, done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const newVotingEventName = 'An Event which moves to the next step of the flow';

        let votingEventId;
        let votingEventRound: number;
        let votes: VoteCredentialized[];
        let votingEvent;
        let tech0: Technology;
        let tech1: Technology;
        const ringForTech0 = 'hold';
        const ringForTech1 = 'assess';
        const productionTag = 'Production';
        const trainingTag = 'Trainig';
        const colleaguesTag = 'Colleagues';

        let headers;

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createVotingEventForVotingEventAndReturnHeaders(cachedDb, newVotingEventName)),
                tap(data => {
                    votingEventId = data.votingEventId;
                    headers = data.headers;
                }),
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId }, null, headers),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap(vEvent => {
                    votingEvent = vEvent;
                    tech0 = votingEvent.technologies[0];
                    tech1 = votingEvent.technologies[1];
                    votes = [
                        {
                            credentials: { votingEvent, voterId: { nickname: 'I am the first voter' } },
                            votes: [
                                {
                                    ring: ringForTech0,
                                    technology: tech0,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                    comment: { text: `I am the comment for vote[1] on tech ${tech0.name}` },
                                    tags: [productionTag, trainingTag],
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent, voterId: { nickname: 'two A' } },
                            votes: [
                                {
                                    ring: ringForTech0,
                                    technology: tech0,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                    tags: [productionTag, colleaguesTag],
                                },
                                {
                                    ring: ringForTech1,
                                    technology: tech1,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                    comment: { text: `I am the comment for vote[1] on tech ${tech1.name}` },
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent, voterId: { nickname: 'five A' } },
                            votes: [
                                {
                                    ring: ringForTech0,
                                    technology: tech0,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                    tags: [colleaguesTag, trainingTag],
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent, voterId: { nickname: 'seven A' } },
                            votes: [
                                {
                                    ring: ringForTech1,
                                    technology: tech1,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                    ];
                }),
                concatMap(() => forkJoin(votes.map(vote => mongodbService(cachedDb, ServiceNames.saveVotes, vote)))),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap(votingEvent => {
                    votingEventRound = votingEvent.round;
                }),
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.moveToNexFlowStep, { _id: votingEventId }, null, headers),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap((votingEvent: VotingEvent) => {
                    expect(votingEvent.round).to.equal(votingEventRound + 1);
                    const t0 = votingEvent.technologies.find(t => t.name === tech0.name);
                    expect(t0.votingResult.votesForRing.length).to.equal(1);
                    expect(t0.votingResult.votesForRing[0].ring).to.equal(ringForTech0);
                    expect(t0.votingResult.votesForRing[0].count).to.equal(3);
                    expect(t0.votingResult.votesForTag.length).to.equal(3);
                    const productionTagRes = t0.votingResult.votesForTag.find(t => t.tag === productionTag);
                    expect(productionTagRes.count).to.equal(2);
                    const trainingTagRes = t0.votingResult.votesForTag.find(t => t.tag === trainingTag);
                    expect(trainingTagRes.count).to.equal(2);
                    const colleaguesTagRes = t0.votingResult.votesForTag.find(t => t.tag === colleaguesTag);
                    expect(colleaguesTagRes.count).to.equal(2);
                    const t1 = votingEvent.technologies.find(t => t.name === tech1.name);
                    expect(t1.votingResult.votesForRing.length).to.equal(1);
                    expect(t1.votingResult.votesForRing[0].ring).to.equal(ringForTech1);
                    expect(t1.votingResult.votesForRing[0].count).to.equal(2);
                    expect(t1.votingResult.votesForTag).to.be.undefined;
                }),
                // We move to the third step and want to check that the voting results are the same at least in terms of numbers
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.moveToNexFlowStep, { _id: votingEventId }, null, headers),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap((votingEvent: VotingEvent) => {
                    expect(votingEvent.round).to.equal(votingEventRound + 2);
                    const t0 = votingEvent.technologies.find(t => t.name === tech0.name);
                    expect(t0.votingResult.votesForRing.length).to.equal(1);
                    const productionTagRes = t0.votingResult.votesForTag.find(t => t.tag === productionTag);
                    expect(productionTagRes.count).to.equal(2);
                    const trainingTagRes = t0.votingResult.votesForTag.find(t => t.tag === trainingTag);
                    expect(trainingTagRes.count).to.equal(2);
                    const colleaguesTagRes = t0.votingResult.votesForTag.find(t => t.tag === colleaguesTag);
                    expect(colleaguesTagRes.count).to.equal(2);
                    const t1 = votingEvent.technologies.find(t => t.name === tech1.name);
                    expect(t1.votingResult.votesForRing.length).to.equal(1);
                    expect(t1.votingResult.votesForTag).to.be.undefined;
                }),
            )
            .subscribe(
                null,
                err => {
                    cachedDb.client.close();
                    logError(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it(`2.7 A Voting Event is created and a person is set as author of the recommendation for one of the techs
    and then it is reset, then a new recommender is defined and a recommendation is set`, done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const newVotingEventName =
            'An Event where a person is set as the author of the recommendation of the tecnology';

        let votingEventId;
        // let votes: VoteCredentialized[];
        // let votingEvent;
        let tech0: Technology;

        const firstAuthorId = 'I am the FIRST person who wants to write the recommendation';
        const secondAuthorId = 'I am the SECOND person who wants to write the recommendation';
        const firstAuthor: User = { user: firstAuthorId };
        const secondAuthor: User = { user: secondAuthorId };

        const recommendation: Recommendation = {
            author: secondAuthorId,
            text: 'This is a very good tech',
            ring: 'adopt',
            timestamp: 'now',
        };

        let recommendationAuthorAlreadySetErrorEncountered = false;
        let differentRecommenderErrorEncountered = false;

        let headers;

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                concatMap(() => createAndOpenVotingEvent(cachedDb, newVotingEventName)),
                tap(_votingEventId => {
                    votingEventId = _votingEventId;
                }),
                concatMap(() =>
                    addUsers(cachedDb.db.collection(config.usersCollection), {
                        users: [firstAuthor, secondAuthor],
                    }),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap((votingEvent: VotingEvent) => {
                    tech0 = votingEvent.technologies[0];
                }),
                // the first author of the recommendation logs in
                concatMap(() => authenticateForTest(cachedDb, firstAuthor.user, 'pwd1')),
                // the first author sets itself as the recommendation author for techo for the first time
                concatMap(headers =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.setRecommendationAuthor,
                        {
                            votingEventId,
                            technologyName: tech0.name,
                        },
                        null,
                        headers,
                    ),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap((votingEvent: VotingEvent) => {
                    const t0 = votingEvent.technologies.find(t => t.name === tech0.name);
                    expect(t0.recommendation).to.be.not.undefined;
                    expect(t0.recommendation.author).equal(firstAuthorId);
                }),
                // the second author logs in and tries to set itself as the recommendation author for tech0 and gets an error
                concatMap(() => authenticateForTest(cachedDb, secondAuthor.user, 'pwd2')),
                concatMap(headers =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.setRecommendationAuthor,
                        {
                            votingEventId,
                            technologyName: tech0.name,
                        },
                        null,
                        headers,
                    ),
                ),
                catchError(err => {
                    recommendationAuthorAlreadySetErrorEncountered = true;
                    expect(err.errorCode).equal(ERRORS.recommendationAuthorAlreadySet.errorCode);
                    expect(err.currentAuthor).equal(firstAuthorId);
                    return of(null);
                }),
                // the first author logs in again and tries to set itself as the recommendation author fortech0 and does not get an error
                concatMap(() => authenticateForTest(cachedDb, firstAuthor.user, 'pwd1')),
                tap(_headers => (headers = _headers)),
                concatMap(() =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.setRecommendationAuthor,
                        {
                            votingEventId,
                            technologyName: tech0.name,
                        },
                        null,
                        headers,
                    ),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap((votingEvent: VotingEvent) => {
                    const t0 = votingEvent.technologies.find(t => t.name === tech0.name);
                    expect(t0.recommendation.author).equal(firstAuthorId);
                }),
                // the first author resets the recommendation
                concatMap(() =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.resetRecommendation,
                        {
                            votingEventId,
                            technologyName: tech0.name,
                        },
                        null,
                        headers,
                    ),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap((votingEvent: VotingEvent) => {
                    const t0 = votingEvent.technologies.find(t => t.name === tech0.name);
                    expect(t0.recommendation).to.be.null;
                }),
                // the second author logs in again and now succeeds in setting itself as the author of the recommendation
                concatMap(() => authenticateForTest(cachedDb, secondAuthor.user, 'pwd2')),
                tap(_headers => (headers = _headers)),
                concatMap(() =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.setRecommendationAuthor,
                        {
                            votingEventId,
                            technologyName: tech0.name,
                        },
                        null,
                        headers,
                    ),
                ),
                // and finally sets the actual recommendation
                concatMap(() =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.setRecommendation,
                        {
                            votingEventId,
                            technologyName: tech0.name,
                            recommendation,
                        },
                        null,
                        headers,
                    ),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap((votingEvent: VotingEvent) => {
                    const t0 = votingEvent.technologies.find(t => t.name === tech0.name);
                    expect(t0.recommendation).to.be.not.undefined;
                    expect(t0.recommendation.author).equal(secondAuthorId);
                    expect(t0.recommendation.text).equal(recommendation.text);
                    expect(t0.recommendation.ring).equal(recommendation.ring);
                    expect(t0.recommendation.timestamp).equal(recommendation.timestamp);
                }),
                // now the first author tries to set the recommendation again and gets an error
                concatMap(() => authenticateForTest(cachedDb, firstAuthor.user, 'pwd1')),
                concatMap(() =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.setRecommendation,
                        {
                            votingEventId,
                            technologyName: tech0.name,
                            recommendation: {
                                text: 'A new recommendation',
                                ring: 'hold',
                                timestamp: 'yesterday',
                            },
                        },
                        null,
                        headers,
                    ),
                ),
                catchError(err => {
                    differentRecommenderErrorEncountered = true;
                    expect(err.errorCode).equal(ERRORS.recommendationAuthorDifferent.errorCode);
                    expect(err.currentAuthor).equal(secondAuthorId);
                    return of(null);
                }),
            )
            .subscribe(
                () => {
                    expect(recommendationAuthorAlreadySetErrorEncountered).to.be.true;
                    expect(differentRecommenderErrorEncountered).to.be.true;
                },
                err => {
                    cachedDb.client.close();
                    logError(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('2.8 create a voting event and then set its technologies', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const newVotingEventName = 'A Voting Event for which we set the technologies';
        const technologies: Technology[] = [
            { name: 'The first tech', description: 'first tech', quadrant: 'tools', isNew: true },
            { name: 'The second tech', description: 'second tech', quadrant: 'tools', isNew: false },
        ];
        let votingEventId: ObjectId;
        let headers;

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createVotingEventForVotingEventAndReturnHeaders(cachedDb, newVotingEventName)),
                tap(data => {
                    votingEventId = data.votingEventId;
                    headers = data.headers;
                }),
                switchMap(() =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.setTechologiesForEvent,
                        { _id: votingEventId, technologies },
                        null,
                        headers,
                    ),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id: votingEventId })),
            )
            .subscribe(
                (votingEvent: VotingEvent) => {
                    expect(votingEvent).to.be.not.undefined;
                    expect(votingEvent.technologies).to.be.not.undefined;
                    expect(votingEvent.technologies.length).equal(technologies.length);
                    expect(votingEvent.technologies[0]._id).to.be.not.undefined;
                },
                err => {
                    cachedDb.client.close();
                    logError(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('2.9 the admin of an initiative creates an event for this initiative', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const initiativeName = 'The initiative for a voting event to be created';
        const initiativeAdmin: User = { user: 'Adming of the Initiative for the Voting Event' };
        let initiative: Initiative;

        const votingEventName = 'A Voting Event created by the admin of the Initiative it belongs to';
        let votingEventId: string;

        // first clean the db
        cancelAndCreateInitiative(cachedDb, initiativeName, initiativeAdmin, true)
            // then start the test
            .pipe(
                concatMap(() => readInitiative(cachedDb, initiativeName)),
                tap(_initiative => (initiative = _initiative)),
                concatMap(() => authenticateForTest(cachedDb, initiativeAdmin.user, 'my password')),
                concatMap(headers =>
                    createVotingEventForTest(cachedDb, votingEventName, headers, initiativeName, initiative._id),
                ),
                tap(_id => (votingEventId = _id.toHexString())),
                concatMap(() => readVotingEvent(cachedDb, votingEventId)),
                tap(votingEvent => {
                    expect(votingEvent).to.be.not.undefined;
                    expect(votingEvent.name).equal(votingEventName);
                }),
            )
            .subscribe(
                null,
                err => {
                    cachedDb.client.close();
                    logError(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('3.0 a user who is not admin of an initiative tries to create an event for this initiative and fails', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const initiativeName = 'The initiative where an admin wannabe tries to create an event';
        const initiativeAdmin: User = { user: 'The real admin' };
        const adminWannabe: User = { user: 'admin wannabe' };
        let initiative: Initiative;

        const votingEventName = 'A Voting Event the admin wannabe would like to create';

        // first clean the db
        cancelAndCreateInitiative(cachedDb, initiativeName, initiativeAdmin, true)
            // then start the test
            .pipe(
                concatMap(() => addUsers(cachedDb.db.collection(config.usersCollection), { users: [adminWannabe] })),
                concatMap(() => readInitiative(cachedDb, initiativeName)),
                tap(_initiative => (initiative = _initiative)),
                concatMap(() => authenticateForTest(cachedDb, adminWannabe.user, 'my password')),
                concatMap(headers =>
                    createVotingEventForTest(cachedDb, votingEventName, headers, initiativeName, initiative._id),
                ),
            )
            .subscribe(
                data => {
                    cachedDb.client.close();
                    console.error('Data received', data);
                    const error = 'This test should have generated an error';
                    done(error);
                },
                err => {
                    expect(err.errorCode).equal(ERRORS.userWithNotTheRequestedRole.errorCode);
                    cachedDb.client.close();
                    done();
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('3.1 a user who is an admin of a VotingEvent adds some users with some Groups', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const votingEventName = 'The cool Voting Event for which we add some users with Groups';
        const userName = 'The user with Groups';
        const userGroups = [`Architect for "${votingEventName}"`];

        const users: User[] = [{ user: userName, groups: userGroups }];

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createVotingEventForVotingEventAndReturnHeaders(cachedDb, votingEventName)),
                concatMap(resp => {
                    const votingEventId = resp.votingEventId;
                    const params = {
                        votingEventId,
                        users,
                    };
                    return mongodbService(cachedDb, ServiceNames.addUsersForVotingEvent, params, null, resp.headers);
                }),
                concatMap(() => findJustOneUserObs(cachedDb.db.collection(config.usersCollection), userName)),
                tap(user => {
                    expect(user.groups.length).equal(userGroups.length);
                    expect(user.groups[0]).equal(userGroups[0]);
                }),
            )
            .subscribe(
                null,
                err => {
                    cachedDb.client.close();
                    logError(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);
});
