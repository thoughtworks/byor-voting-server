import { expect } from 'chai';
import { switchMap, map, tap, catchError } from 'rxjs/operators';
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
                        mongodbService(cachedDb, ServiceNames.getVotingEvents, { _id: ve._id, hard: true }),
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
                    expect(event.technologies.filter(t => t.name === newTech.name).length).to.equal(1);
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
});
