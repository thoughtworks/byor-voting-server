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
import { initializeVotingEventsAndVotes } from './base.spec';
import { Technology } from '../model/technology';
import { logError } from '../lib/utils';
import { ObjectId } from 'bson';
import { Comment } from '../model/comment';
import { Vote } from '../model/vote';

describe('Operations on votingevents collection', () => {
    it('1.0 create a voting event and then reads it', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const newVotingEvent = { name: 'A Voting Event' };

        initializeVotingEventsAndVotes(cachedDb.dbName)
            .pipe(
                switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, newVotingEvent)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvents)),
            )
            .subscribe(
                votingEvents => {
                    expect(votingEvents.length).to.equal(1);
                    expect(votingEvents[0].name).to.equal(newVotingEvent.name);
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

        const newVotingEvent = { name: 'A Doubled Event 2' };

        initializeVotingEventsAndVotes(cachedDb.dbName)
            .pipe(
                switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, newVotingEvent)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, newVotingEvent)),
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

        const newVotingEvent = { name: 'A an Event to open' };

        let votingEventId;
        initializeVotingEventsAndVotes(cachedDb.dbName)
            .pipe(
                switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, newVotingEvent)),
                tap(id => (votingEventId = id)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvents)),
                tap(votingEvents => {
                    const votingEvent = votingEvents[0];
                    expect(votingEvent.round).to.be.undefined;
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId })),
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

        const newVotingEventName = { name: 'A an Event to close' };

        let votingEventId;
        initializeVotingEventsAndVotes(cachedDb.dbName)
            .pipe(
                switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, newVotingEventName)),
                tap(id => (votingEventId = id)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId })),
                switchMap(() => mongodbService(cachedDb, ServiceNames.closeVotingEvent, { _id: votingEventId })),
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
        let newVotingEvent;
        initializeVotingEventsAndVotes(cachedDb.dbName)
            .pipe(
                switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, { name: newVotingEventName })),
                tap(id => (votingEventId = id)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId })),
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
                switchMap(() => mongodbService(cachedDb, ServiceNames.cancelVotingEvent, cancelHardVotingEventParams)),
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
        let newVotingEvent;
        initializeVotingEventsAndVotes(cachedDb.dbName)
            .pipe(
                switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, { name: eventName })),
                tap(id => (votingEventId = id)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId })),
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
                    mongodbService(cachedDb, ServiceNames.cancelVotingEvent, { _id: votingEventId, hard: true }),
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
        let newVotingEvent;
        initializeVotingEventsAndVotes(cachedDb.dbName)
            .pipe(
                switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, { name: eventName })),
                tap(id => (votingEventId = id)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId })),
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
                switchMap(() => mongodbService(cachedDb, ServiceNames.cancelVotingEvent, cancelSoftVotingEvent)),
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

                    const votesOnNewEvent = allVotes.filter(
                        vote => vote.eventId.id.toString() === newVotingEvent._id.id.toString(),
                    );
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

        const newVotingEvent1 = { name: 'A Voting Event - 1' };
        const newVotingEvent2 = { name: 'A Voting Event - 2' };

        initializeVotingEventsAndVotes(cachedDb.dbName)
            .pipe(
                switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, newVotingEvent1)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, newVotingEvent2)),
                switchMap(id => mongodbService(cachedDb, ServiceNames.getVotingEvent, id)),
            )
            .subscribe(
                votingEvent => {
                    expect(votingEvent.name).to.equal(newVotingEvent2.name);
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
        const votingEventName = { name: 'event A-winner' };
        let votingEvent;

        initializeVotingEventsAndVotes(cachedDb.dbName)
            .pipe(
                switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, votingEventName)),
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
        const votingEventName = { name: 'event A-winner' };
        let votingEvent;

        initializeVotingEventsAndVotes(cachedDb.dbName)
            .pipe(
                switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, votingEventName)),
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
        const votingEventName = { name: 'event revote' };

        let votingEventId;
        let round;
        initializeVotingEventsAndVotes(cachedDb.dbName)
            .pipe(
                switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, votingEventName)),
                tap(id => (votingEventId = id)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId })),
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
                switchMap(() => mongodbService(cachedDb, ServiceNames.closeForRevote, { _id: votingEventId })),
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
        const votingEventName = { name: 'event Skinny and Fat' };
        let votingEvent;

        let votingEventId;
        initializeVotingEventsAndVotes(cachedDb.dbName)
            .pipe(
                switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, votingEventName)),
                tap(id => (votingEventId = id)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId })),
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
        mongodbService(cachedDb, ServiceNames.getVotingEvents)
            .pipe(
                map(votingEvents => votingEvents.filter(ve => ve.name === votingEventName)),
                switchMap(votingEvents => {
                    const votingEventsDeleteObs = votingEvents.map(ve =>
                        mongodbService(cachedDb, ServiceNames.cancelVotingEvent, { _id: ve._id, hard: true }),
                    );
                    return votingEvents.length > 0 ? forkJoin(votingEventsDeleteObs) : of(null);
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, { name: votingEventName })),
                tap(id => (votingEventId = id)),
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId, round: 1 }),
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
        const firstAuthor = 'the first author of the comment';
        const secondCommentText = 'I am the second comment for tech';
        const secondAuthor = 'the second author of the comment';
        const replyToSecondComment = 'i am the reply to the second comment';
        const replyAuthor = ' I am the author of the reply';

        let votingEventId;
        let technology: Technology;
        let techId: string;
        mongodbService(cachedDb, ServiceNames.getVotingEvents)
            .pipe(
                map(votingEvents => votingEvents.filter(ve => ve.name === votingEventName)),
                switchMap(votingEvents => {
                    const votingEventsDeleteObs = votingEvents.map(ve =>
                        mongodbService(cachedDb, ServiceNames.cancelVotingEvent, { _id: ve._id, hard: true }),
                    );
                    return votingEvents.length > 0 ? forkJoin(votingEventsDeleteObs) : of(null);
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, { name: votingEventName })),
                tap(id => (votingEventId = id)),
                // open the even to load the technologies - currently technologies are loaded into the event when the event is opened
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId, round: 1 }),
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
                        author: firstAuthor,
                    }),
                ),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap((event: VotingEvent) => {
                    technology = event.technologies.find(t => t.name === newTech.name);
                    expect(technology.comments).to.be.not.undefined;
                    expect(technology.comments.length).to.equal(1);
                    expect(technology.comments[0].text).to.equal(firstCommentText);
                    expect(technology.comments[0].author).to.equal(firstAuthor);
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
                        author: secondAuthor,
                    }),
                ),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                map((event: VotingEvent) => event.technologies.find(t => t.name === newTech.name)),
                tap((technology: Technology) => {
                    const comments = technology.comments;
                    expect(comments).to.be.not.undefined;
                    expect(comments.length).to.equal(2);
                    expect(comments[1].text).to.equal(secondCommentText);
                    expect(comments[1].author).to.equal(secondAuthor);
                    expect(comments[1].id).to.be.not.undefined;
                    expect(comments[1].timestamp).to.be.not.undefined;
                    expect(comments[1].replies).to.be.undefined;
                }),

                // add a reply to the second comment added to the technology
                switchMap((technology: Technology) => {
                    const commentId = technology.comments[1].id;
                    const reply: Comment = { text: replyToSecondComment, author: replyAuthor };
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
                    expect(replies[0].author).to.equal(replyAuthor);
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
        mongodbService(cachedDb, ServiceNames.getVotingEvents)
            .pipe(
                map(votingEvents => votingEvents.filter(ve => ve.name === votingEventName)),
                switchMap(votingEvents => {
                    const votingEventsDeleteObs = votingEvents.map(ve =>
                        mongodbService(cachedDb, ServiceNames.cancelVotingEvent, { _id: ve._id, hard: true }),
                    );
                    return votingEvents.length > 0 ? forkJoin(votingEventsDeleteObs) : of(null);
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, { name: votingEventName })),
                tap(id => (votingEventId = id)),
                // open the even to load the technologies - currently technologies are loaded into the event when the event is opened
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId, round: 1 }),
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

        const newVotingEvent = { name: 'An Event with cancelled property set to false' };

        let votingEventId;
        initializeVotingEventsAndVotes(cachedDb.dbName)
            .pipe(
                concatMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, newVotingEvent)),
                tap(id => (votingEventId = id)),
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.cancelVotingEvent, { _id: votingEventId, hard: false }),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id: votingEventId })),
                tap(votingEvent => {
                    expect(votingEvent).to.be.undefined;
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.undoCancelVotingEvent, { _id: votingEventId })),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id: votingEventId })),
                tap(votingEvent => {
                    expect(votingEvent.name).to.equal(newVotingEvent.name);
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

        const newVotingEvent = { name: 'An Event with votes and comments to be counted' };
        const nickanmeOfFirstVoter = 'I am the first voter';

        let votingEventId;
        let votes: VoteCredentialized[];
        let votingEvent;
        let tech0: Technology;
        let tech1: Technology;

        initializeVotingEventsAndVotes(cachedDb.dbName)
            .pipe(
                concatMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, newVotingEvent)),
                tap(id => (votingEventId = id)),
                concatMap(() => mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId })),
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
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotes, { eventId: votingEventId })),
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

        const newVotingEvent = { name: 'An Event which moves to the next step of the flow' };

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

        initializeVotingEventsAndVotes(cachedDb.dbName)
            .pipe(
                concatMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, newVotingEvent)),
                tap(id => (votingEventId = id)),
                concatMap(() => mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId })),
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
                concatMap(() => mongodbService(cachedDb, ServiceNames.moveToNexFlowStep, { _id: votingEventId })),
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
                concatMap(() => mongodbService(cachedDb, ServiceNames.moveToNexFlowStep, { _id: votingEventId })),
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
});
