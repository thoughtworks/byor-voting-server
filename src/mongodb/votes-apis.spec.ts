import { expect } from 'chai';
import { forkJoin, of, throwError } from 'rxjs';
import { switchMap, tap, catchError, concatMap } from 'rxjs/operators';
import { InsertOneWriteOpResult } from 'mongodb';
import { mongodbService, CachedDB } from '../api/service';
import { config } from '../api/config';
import { ServiceNames } from '../service-names';
import { TEST_TECHNOLOGIES } from '../model/technologies.local-data';
import { VoteCredentialized } from '../model/vote-credentialized';
import { Vote } from '../model/vote';
import { Blip } from '../model/blip';
import { cleanVotingEventsAndVotesCollections } from './base.spec';
import { Technology, Recommendation } from '../model/technology';
import { Comment } from '../model/comment';
import { Credentials } from '../model/credentials';
import { VotingEvent } from '../model/voting-event';
import { createAndOpenVotingEvent, readVotingEvent, openVotingEvent, authenticateForTest } from './test.utils';
import { User } from '../model/user';
import { addUsers } from '../api/authentication-api';

describe('CRUD operations on Votes collection', () => {
    it('1.0 loads the votes and then read them', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        let numberOfInsertedItems = 0;
        mongodbService(cachedDb, ServiceNames.deleteVotes)
            .pipe(
                switchMap(() => mongodbService(cachedDb, ServiceNames.loadVotes)),
                tap(result => {
                    const resultInsert: InsertOneWriteOpResult = result.result;
                    numberOfInsertedItems = resultInsert.insertedCount;
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotes)),
            )
            .subscribe(
                votes => {
                    expect(votes.length).to.equal(numberOfInsertedItems);
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

    it('1.1 saves one vote', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const votingEventName = 'this event';
        const credentials = {
            votingEvent: null,
            voterId: { firstName: 'one', lastName: 'two' },
        };
        let credentializedVote: VoteCredentialized;

        const commentText = 'this tech is crap';

        let votingEventId;

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventName)),
                tap(id => (votingEventId = id)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap(vEvent => {
                    credentials.votingEvent = vEvent;
                    credentializedVote = {
                        credentials,
                        votes: [
                            {
                                ring: 'Hold',
                                technology: TEST_TECHNOLOGIES[0],
                                eventName: credentials.votingEvent.name,
                                eventId: credentials.votingEvent._id,
                                eventRound: 1,
                                comment: { text: commentText },
                            },
                        ],
                    };
                }),
                switchMap(() => openVotingEvent(cachedDb, votingEventId)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.hasAlreadyVoted, { credentials })),
                tap(hasVoted => {
                    expect(hasVoted).to.be.false;
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.saveVotes, credentializedVote)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotes)),
                tap(votes => {
                    expect(votes.length).to.equal(1);
                    expect(votes[0].comment.text).to.equal(commentText);
                    expect(votes[0].comment.id).to.be.not.undefined;
                    expect(votes[0].comment.timestamp).to.be.not.undefined;
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.hasAlreadyVoted, { credentials })),
                tap(hasVoted => {
                    expect(hasVoted).to.be.true;
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
    }).timeout(20000);

    describe('1.2 saves some votes and then reads the votes of the voter', () => {
        it(`1.2.1 Use nickName to identify the voter`, done => {
            const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
            const votingEventName = 'Event where a voter votes using nickName to identify';
            const voterId = { nickname: 'Nick the Voter' };

            const tech0 = TEST_TECHNOLOGIES[0];
            const ring0 = 'Hold';
            const tech1 = TEST_TECHNOLOGIES[1];
            const ring1 = 'Adopt';
            let voterVotes: any[];

            let votes: VoteCredentialized[];

            let votingEvent;

            cleanVotingEventsAndVotesCollections(cachedDb.dbName)
                .pipe(
                    switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventName)),
                    concatMap(votingEventId => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                    tap(vEvent => {
                        votingEvent = vEvent;
                        voterVotes = [
                            {
                                ring: ring0,
                                technology: tech0,
                                eventName: votingEvent.name,
                                eventId: votingEvent._id,
                                eventRound: 1,
                            },
                            {
                                ring: ring1,
                                technology: tech1,
                                eventName: votingEvent.name,
                                eventId: votingEvent._id,
                                eventRound: 1,
                            },
                        ];
                        votes = [
                            {
                                credentials: { votingEvent, voterId },
                                votes: voterVotes,
                            },
                            {
                                credentials: { votingEvent, voterId: { nickname: 'three A' } },
                                votes: [
                                    {
                                        ring: 'Hold',
                                        technology: TEST_TECHNOLOGIES[0],
                                        eventName: votingEvent.name,
                                        eventId: votingEvent._id,
                                        eventRound: 1,
                                    },
                                ],
                            },
                            {
                                credentials: { votingEvent, voterId: { nickname: 'five A' } },
                                votes: [
                                    {
                                        ring: 'Hold',
                                        technology: TEST_TECHNOLOGIES[0],
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
                                        ring: 'Assess',
                                        technology: TEST_TECHNOLOGIES[1],
                                        eventName: votingEvent.name,
                                        eventId: votingEvent._id,
                                        eventRound: 1,
                                    },
                                ],
                            },
                        ];
                    }),
                    concatMap(() =>
                        forkJoin(votes.map(vote => mongodbService(cachedDb, ServiceNames.saveVotes, vote))),
                    ),
                    concatMap(() => mongodbService(cachedDb, ServiceNames.getVotes, { votingEvent, voterId })),
                    tap((votes: Vote[]) => {
                        expect(votes.length).equal(voterVotes.length);
                        expect(votes[0].technology.name).equal(tech0.name);
                        expect(votes[0].ring).equal(ring0);
                        expect(votes[1].technology.name).equal(tech1.name);
                        expect(votes[1].ring).equal(ring1);
                    }),
                    concatMap(() =>
                        mongodbService(cachedDb, ServiceNames.getVotes, {
                            votingEvent,
                            voterId: { nickame: 'I have not Nick' },
                        }),
                    ),
                    tap((votes: Vote[]) => {
                        expect(votes.length).equal(0);
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
        }).timeout(20000);

        it(`1.2.2 Use the userId to identify the voter`, done => {
            const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
            const votingEventName = 'Event where a voter votes using userId to identify';
            const voterId = { userId: 'UserId the Voter' };

            const tech0 = TEST_TECHNOLOGIES[0];
            const ring0 = 'Hold';
            const tech1 = TEST_TECHNOLOGIES[1];
            const ring1 = 'Adopt';
            let voterVotes: any[];

            let votes: VoteCredentialized[];

            let votingEvent;
            let votingEventId;

            cleanVotingEventsAndVotesCollections(cachedDb.dbName)
                .pipe(
                    switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventName)),
                    tap(id => (votingEventId = id)),
                    concatMap(() => openVotingEvent(cachedDb, votingEventId)),
                    concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                    tap(vEvent => {
                        votingEvent = vEvent;
                        voterVotes = [
                            {
                                ring: ring0,
                                technology: tech0,
                                eventName: votingEvent.name,
                                eventId: votingEvent._id,
                                eventRound: 1,
                            },
                            {
                                ring: ring1,
                                technology: tech1,
                                eventName: votingEvent.name,
                                eventId: votingEvent._id,
                                eventRound: 1,
                            },
                        ];
                        votes = [
                            {
                                credentials: { votingEvent, voterId },
                                votes: voterVotes,
                            },
                            {
                                credentials: { votingEvent, voterId: { nickname: 'three A' } },
                                votes: [
                                    {
                                        ring: 'Hold',
                                        technology: TEST_TECHNOLOGIES[0],
                                        eventName: votingEvent.name,
                                        eventId: votingEvent._id,
                                        eventRound: 1,
                                    },
                                ],
                            },
                            {
                                credentials: { votingEvent, voterId: { nickname: 'five A' } },
                                votes: [
                                    {
                                        ring: 'Hold',
                                        technology: TEST_TECHNOLOGIES[0],
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
                                        ring: 'Assess',
                                        technology: TEST_TECHNOLOGIES[1],
                                        eventName: votingEvent.name,
                                        eventId: votingEvent._id,
                                        eventRound: 1,
                                    },
                                ],
                            },
                        ];
                    }),
                    concatMap(() =>
                        forkJoin(votes.map(vote => mongodbService(cachedDb, ServiceNames.saveVotes, vote))),
                    ),
                    concatMap(() => mongodbService(cachedDb, ServiceNames.getVotes, { votingEvent, voterId })),
                    tap((votes: Vote[]) => {
                        expect(votes.length).equal(voterVotes.length);
                        expect(votes[0].technology.name).equal(tech0.name);
                        expect(votes[0].ring).equal(ring0);
                        expect(votes[1].technology.name).equal(tech1.name);
                        expect(votes[1].ring).equal(ring1);
                    }),
                    concatMap(() =>
                        mongodbService(cachedDb, ServiceNames.getVotes, {
                            votingEvent,
                            voterId: { nickame: 'I have not UserId' },
                        }),
                    ),
                    tap((votes: Vote[]) => {
                        expect(votes.length).equal(0);
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
        }).timeout(20000);

        it(`1.2.3 Use firstName and lastName to identify the voter`, done => {
            const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
            const votingEventName = 'Event where a voter votes with firstName and lastName';
            const voterId = { firstName: 'Voter First Name A', lastName: 'Voter Last Name  A' };

            const tech0 = TEST_TECHNOLOGIES[0];
            const ring0 = 'Hold';
            const tech1 = TEST_TECHNOLOGIES[1];
            const ring1 = 'Adopt';
            let voterVotes: any[];

            let votes: VoteCredentialized[];

            let votingEvent;
            let votingEventId;

            cleanVotingEventsAndVotesCollections(cachedDb.dbName)
                .pipe(
                    switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventName)),
                    tap(id => (votingEventId = id)),
                    concatMap(() => openVotingEvent(cachedDb, votingEventId)),
                    concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                    tap(vEvent => {
                        votingEvent = vEvent;
                        voterVotes = [
                            {
                                ring: ring0,
                                technology: tech0,
                                eventName: votingEvent.name,
                                eventId: votingEvent._id,
                                eventRound: 1,
                            },
                            {
                                ring: ring1,
                                technology: tech1,
                                eventName: votingEvent.name,
                                eventId: votingEvent._id,
                                eventRound: 1,
                            },
                        ];
                        votes = [
                            {
                                credentials: { votingEvent, voterId },
                                votes: voterVotes,
                            },
                            {
                                credentials: { votingEvent, voterId: { firstName: 'three A', lastName: 'four A' } },
                                votes: [
                                    {
                                        ring: 'Hold',
                                        technology: TEST_TECHNOLOGIES[0],
                                        eventName: votingEvent.name,
                                        eventId: votingEvent._id,
                                        eventRound: 1,
                                    },
                                ],
                            },
                            {
                                credentials: { votingEvent, voterId: { firstName: 'five A', lastName: 'six A' } },
                                votes: [
                                    {
                                        ring: 'Hold',
                                        technology: TEST_TECHNOLOGIES[0],
                                        eventName: votingEvent.name,
                                        eventId: votingEvent._id,
                                        eventRound: 1,
                                    },
                                ],
                            },
                            {
                                credentials: { votingEvent, voterId: { firstName: 'seven A', lastName: 'eight A' } },
                                votes: [
                                    {
                                        ring: 'Assess',
                                        technology: TEST_TECHNOLOGIES[1],
                                        eventName: votingEvent.name,
                                        eventId: votingEvent._id,
                                        eventRound: 1,
                                    },
                                ],
                            },
                        ];
                    }),
                    concatMap(() =>
                        forkJoin(votes.map(vote => mongodbService(cachedDb, ServiceNames.saveVotes, vote))),
                    ),
                    concatMap(() => mongodbService(cachedDb, ServiceNames.getVotes, { votingEvent, voterId })),
                    tap((votes: Vote[]) => {
                        expect(votes.length).equal(voterVotes.length);
                        expect(votes[0].technology.name).equal(tech0.name);
                        expect(votes[0].ring).equal(ring0);
                        expect(votes[1].technology.name).equal(tech1.name);
                        expect(votes[1].ring).equal(ring1);
                    }),
                    concatMap(() =>
                        mongodbService(cachedDb, ServiceNames.getVotes, {
                            votingEvent,
                            voterId: { firstName: 'I have not', lastName: 'voted yet' },
                        }),
                    ),
                    tap((votes: Vote[]) => {
                        expect(votes.length).equal(0);
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
        }).timeout(20000);
    });

    it('1.2.2 saves some votes and then aggreagates them', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        const votingEventName = 'event A';
        let votingEvent;
        let votes: VoteCredentialized[];
        let aggregatedVotes: any[];

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventName)),
                switchMap(votingEventId => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap(vEvent => {
                    votingEvent = vEvent;
                    votes = [
                        {
                            credentials: { votingEvent, voterId: { firstName: 'one A', lastName: 'two A' } },
                            votes: [
                                {
                                    ring: 'Hold',
                                    technology: TEST_TECHNOLOGIES[0],
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent, voterId: { firstName: 'three A', lastName: 'four A' } },
                            votes: [
                                {
                                    ring: 'Hold',
                                    technology: TEST_TECHNOLOGIES[0],
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent, voterId: { firstName: 'five A', lastName: 'six A' } },
                            votes: [
                                {
                                    ring: 'Hold',
                                    technology: TEST_TECHNOLOGIES[0],
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent, voterId: { firstName: 'seven A', lastName: 'eight A' } },
                            votes: [
                                {
                                    ring: 'Assess',
                                    technology: TEST_TECHNOLOGIES[1],
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                    ];
                }),
                switchMap(() => forkJoin(votes.map(vote => mongodbService(cachedDb, ServiceNames.saveVotes, vote)))),
                switchMap(() => mongodbService(cachedDb, ServiceNames.aggregateVotes, { votingEvent })),
                // map(data => data),
            )
            .subscribe(
                votes => {
                    aggregatedVotes = votes;
                },
                err => {
                    cachedDb.client.close();
                    done(err);
                },
                () => {
                    expect(aggregatedVotes.length).to.equal(2);
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(20000);

    it(`1.3 try to submit a vote 2 times, first using lower case credentials
    and then same credentials with some uppercase`, done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const votingEventName = 'this event ABC';

        const lowerCaseVoterId = { firstName: 'one', lastName: 'two' };
        const mixedCaseVoterId = { firstName: 'One ', lastName: ' twO ' };
        const credentials1 = { votingEvent: null, voterId: lowerCaseVoterId };
        const credentials2 = { votingEvent: null, voterId: mixedCaseVoterId };
        let credentializedVote1: VoteCredentialized;
        let credentializedVote2: VoteCredentialized;

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventName)),
                switchMap(votingEventId => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap(vEvent => {
                    credentials1.votingEvent = vEvent;
                    credentials2.votingEvent = vEvent;
                    credentializedVote1 = {
                        credentials: credentials1,
                        votes: [
                            {
                                ring: 'Hold',
                                technology: TEST_TECHNOLOGIES[0],
                                eventName: credentials1.votingEvent.name,
                                eventId: credentials1.votingEvent._id,
                                eventRound: 1,
                            },
                        ],
                    };
                    credentializedVote2 = {
                        credentials: credentials2,
                        votes: [
                            {
                                ring: 'Adopt',
                                technology: TEST_TECHNOLOGIES[1],
                                eventName: credentials2.votingEvent.name,
                                eventId: credentials2.votingEvent._id,
                                eventRound: 1,
                            },
                        ],
                    };
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.saveVotes, credentializedVote1)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.saveVotes, credentializedVote2)),
                catchError(err => {
                    if (err.errorCode === 'V-01') {
                        return of(null);
                    } else {
                        throwError('Unexpected error ' + JSON.stringify(err));
                    }
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotes)),
                tap(votes => {
                    expect(votes.length).to.equal(1);
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
    }).timeout(20000);

    it(`1.3.1 submits a vote 2 times, the second time using the override option
    so that the second vote overrides the first`, done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const votingEventName = 'an event where the second vote overrides the first';

        let votingEvent: VotingEvent;

        const voterId1: Credentials = { nickname: 'Nick the voter' };
        const voterId2: Credentials = { userId: 'User the voter' };
        const credentialsVoter1 = { votingEvent: null, voterId: voterId1 };
        const credentialsVoter2 = { votingEvent: null, voterId: voterId2 };
        let credentializedVoteVoter11: VoteCredentialized;
        let credentializedVoteVoter12: VoteCredentialized;
        let credentializedVote2: VoteCredentialized;
        let tech1: Technology;
        let tech2: Technology;
        const ringFirstVoteVoter1Tech1 = 'Hold';
        const ringFirstVoteVoter1Tech2 = 'Adopt';
        const ringSecondVoteVoter1Tech1 = 'Adopt';
        const ringVoter2 = 'Hold';

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventName)),
                switchMap(votingEventId => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                // both voters vote for the first time
                tap((vEvent: VotingEvent) => {
                    votingEvent = vEvent;
                    tech1 = vEvent.technologies[0];
                    tech2 = vEvent.technologies[2];
                    credentialsVoter1.votingEvent = vEvent;
                    credentialsVoter2.votingEvent = vEvent;
                    credentializedVoteVoter11 = {
                        credentials: credentialsVoter1,
                        votes: [
                            {
                                ring: ringFirstVoteVoter1Tech1,
                                technology: tech1,
                                eventName: credentialsVoter1.votingEvent.name,
                                eventId: credentialsVoter1.votingEvent._id,
                                eventRound: 1,
                            },
                            {
                                ring: ringFirstVoteVoter1Tech2,
                                technology: tech2,
                                eventName: credentialsVoter1.votingEvent.name,
                                eventId: credentialsVoter1.votingEvent._id,
                                eventRound: 1,
                            },
                        ],
                    };
                    credentializedVote2 = {
                        credentials: credentialsVoter2,
                        votes: [
                            {
                                ring: ringVoter2,
                                technology: tech1,
                                eventName: credentialsVoter1.votingEvent.name,
                                eventId: credentialsVoter1.votingEvent._id,
                                eventRound: 1,
                            },
                            {
                                ring: ringVoter2,
                                technology: tech2,
                                eventName: credentialsVoter1.votingEvent.name,
                                eventId: credentialsVoter1.votingEvent._id,
                                eventRound: 1,
                            },
                        ],
                    };
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.saveVotes, credentializedVoteVoter11)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.saveVotes, credentializedVote2)),

                // second time the voter1 votes just for 1 technology with the override option
                tap(() => {
                    credentializedVoteVoter12 = {
                        credentials: credentialsVoter1,
                        votes: [
                            {
                                ring: ringSecondVoteVoter1Tech1,
                                technology: tech1,
                                eventName: credentialsVoter1.votingEvent.name,
                                eventId: credentialsVoter1.votingEvent._id,
                                eventRound: 1,
                            },
                        ],
                        override: true,
                    };
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.saveVotes, credentializedVoteVoter12)),

                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.getVotes, {
                        votingEvent,
                        voterId: voterId1,
                    }),
                ),
                tap((votes: Vote[]) => {
                    expect(votes.length).to.equal(1);
                    expect(votes[0].technology.name).to.equal(tech1.name);
                    expect(votes[0].ring).to.equal(ringSecondVoteVoter1Tech1);
                }),
                // the votes of the second voter remain the ones set in the first vote since the second voter
                // does not vote any more
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.getVotes, {
                        votingEvent,
                        voterId: voterId2,
                    }),
                ),
                tap((votes: Vote[]) => {
                    expect(votes.length).to.equal(2);
                    votes.forEach(v => expect(v.ring).to.equal(ringVoter2));
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
    }).timeout(20000);

    it(`1.3.2 submits a vote using the override option even the first time`, done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const votingEventName = 'an event where the first vote specifies the override option';

        let votingEvent: VotingEvent;

        const voterId1: Credentials = { nickname: 'Nick the overrider' };
        const voterId2: Credentials = { userId: 'User the overrider' };
        const credentialsVoter1 = { votingEvent: null, voterId: voterId1 };
        const credentialsVoter2 = { votingEvent: null, voterId: voterId2 };
        let credentializedVoteVoter11: VoteCredentialized;
        let credentializedVote2: VoteCredentialized;
        let tech1: Technology;
        let tech2: Technology;
        const ringVoter1Tech1 = 'Hold';
        const ringVoter1Tech2 = 'Adopt';
        const ringVoter2 = 'Hold';

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventName)),
                switchMap(votingEventId => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                // both voters vote for the first time
                tap((vEvent: VotingEvent) => {
                    votingEvent = vEvent;
                    tech1 = vEvent.technologies[0];
                    tech2 = vEvent.technologies[2];
                    credentialsVoter1.votingEvent = vEvent;
                    credentialsVoter2.votingEvent = vEvent;
                    credentializedVoteVoter11 = {
                        credentials: credentialsVoter1,
                        votes: [
                            {
                                ring: ringVoter1Tech1,
                                technology: tech1,
                                eventName: credentialsVoter1.votingEvent.name,
                                eventId: credentialsVoter1.votingEvent._id,
                                eventRound: 1,
                            },
                            {
                                ring: ringVoter1Tech2,
                                technology: tech2,
                                eventName: credentialsVoter1.votingEvent.name,
                                eventId: credentialsVoter1.votingEvent._id,
                                eventRound: 1,
                            },
                        ],
                    };
                    credentializedVote2 = {
                        credentials: credentialsVoter2,
                        votes: [
                            {
                                ring: ringVoter2,
                                technology: tech1,
                                eventName: credentialsVoter1.votingEvent.name,
                                eventId: credentialsVoter1.votingEvent._id,
                                eventRound: 1,
                            },
                            {
                                ring: ringVoter2,
                                technology: tech2,
                                eventName: credentialsVoter1.votingEvent.name,
                                eventId: credentialsVoter1.votingEvent._id,
                                eventRound: 1,
                            },
                        ],
                    };
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.saveVotes, credentializedVoteVoter11)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.saveVotes, credentializedVote2)),

                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.getVotes, {
                        votingEvent,
                        voterId: voterId1,
                    }),
                ),
                tap((votes: Vote[]) => {
                    expect(votes.length).to.equal(2);
                    const v1 = votes.find(v => v.technology.name === tech1.name);
                    expect(v1.ring).to.equal(ringVoter1Tech1);
                    const v2 = votes.find(v => v.technology.name === tech2.name);
                    expect(v2.ring).to.equal(ringVoter1Tech2);
                }),
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.getVotes, {
                        votingEvent,
                        voterId: voterId2,
                    }),
                ),
                tap((votes: Vote[]) => {
                    expect(votes.length).to.equal(2);
                    votes.forEach(v => expect(v.ring).to.equal(ringVoter2));
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
    }).timeout(20000);

    it('1.4 saves some votes on different voting events and reads the ones of one voting event', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const votingEventName1 = 'event Aaa';
        const votingEventName2 = 'event Bbb';
        let votes: VoteCredentialized[];

        let votingEventId1;
        let votingEventId2;
        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventName1)),
                tap(votingEventId => (votingEventId1 = votingEventId)),
                switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventName2)),
                tap(votingEventId => (votingEventId2 = votingEventId)),
                switchMap(() =>
                    forkJoin(
                        mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId1),
                        mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId2),
                    ),
                ),
                tap(([vEvent1, vEvent2]) => {
                    votes = [
                        {
                            credentials: { votingEvent: vEvent1, voterId: { firstName: 'one A', lastName: 'two A' } },
                            votes: [{ ring: 'Hold', technology: TEST_TECHNOLOGIES[0], eventRound: 1 }],
                        },
                        {
                            credentials: {
                                votingEvent: vEvent1,
                                voterId: { firstName: 'three A', lastName: 'four A' },
                            },
                            votes: [{ ring: 'Hold', technology: TEST_TECHNOLOGIES[0], eventRound: 1 }],
                        },
                        {
                            credentials: { votingEvent: vEvent1, voterId: { firstName: 'five A', lastName: 'six A' } },
                            votes: [{ ring: 'Hold', technology: TEST_TECHNOLOGIES[0], eventRound: 1 }],
                        },
                        {
                            credentials: {
                                votingEvent: vEvent2,
                                voterId: { firstName: 'seven A', lastName: 'eight A' },
                            },
                            votes: [{ ring: 'Assess', technology: TEST_TECHNOLOGIES[1], eventRound: 1 }],
                        },
                    ];
                }),

                switchMap(() => forkJoin(votes.map(vote => mongodbService(cachedDb, ServiceNames.saveVotes, vote)))),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotes, { eventId: votingEventId1 })),
            )
            .subscribe(
                (votes: Vote[]) => {
                    expect(votes.length).to.equal(3);
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
    }).timeout(20000);

    it('1.5 saves some votes and then calculates the blips', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        const votingEventName = 'event A';
        let votes: VoteCredentialized[];
        let votingEvent;

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventName)),
                tap(votingEventId => {
                    votingEvent = { name: votingEventName, _id: votingEventId, round: 1 };
                    votes = [
                        {
                            credentials: { votingEvent, voterId: { firstName: 'one A', lastName: 'two A' } },
                            votes: [
                                {
                                    ring: 'Hold',
                                    technology: TEST_TECHNOLOGIES[0],
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent, voterId: { firstName: 'three A', lastName: 'four A' } },
                            votes: [
                                {
                                    ring: 'Assess',
                                    technology: TEST_TECHNOLOGIES[0],
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent, voterId: { firstName: 'five A', lastName: 'six A' } },
                            votes: [
                                {
                                    ring: 'Hold',
                                    technology: TEST_TECHNOLOGIES[0],
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent, voterId: { firstName: 'seven A', lastName: 'eight A' } },
                            votes: [
                                {
                                    ring: 'Assess',
                                    technology: TEST_TECHNOLOGIES[1],
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent, voterId: { firstName: 'ninth A', lastName: 'tenth A' } },
                            votes: [
                                {
                                    ring: 'Assess',
                                    technology: TEST_TECHNOLOGIES[1],
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent, voterId: { firstName: 'eleventh A', lastName: 'twelfth A' } },
                            votes: [
                                {
                                    ring: 'Trial',
                                    technology: TEST_TECHNOLOGIES[1],
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent,
                                voterId: { firstName: 'thirteenth A', lastName: 'fourteenth A' },
                            },
                            votes: [
                                {
                                    ring: 'Adopt',
                                    technology: TEST_TECHNOLOGIES[2],
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent,
                                voterId: { firstName: 'fifteenth A', lastName: 'sixteenth A' },
                            },
                            votes: [
                                {
                                    ring: 'Adopt',
                                    technology: TEST_TECHNOLOGIES[2],
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                    ];
                }),
                switchMap(() => forkJoin(votes.map(vote => mongodbService(cachedDb, ServiceNames.saveVotes, vote)))),
                switchMap(() => mongodbService(cachedDb, ServiceNames.calculateBlips, { votingEvent })),
            )
            .subscribe(
                blips => {
                    expect(blips.length).to.equal(3);
                    const blipTech0 = blips.find(b => b.name === TEST_TECHNOLOGIES[0].name);
                    expect(blipTech0.ring).to.equal('Hold');
                    expect(blipTech0.numberOfVotes).to.equal(3);
                    expect(blipTech0.votes.length).to.equal(2);
                    expect(blipTech0.votes.find(v => v.ring === 'Hold').count).to.equal(2);
                    expect(blipTech0.votes.find(v => v.ring === 'Assess').count).to.equal(1);
                    const blipTech1 = blips.find(b => b.name === TEST_TECHNOLOGIES[1].name);
                    expect(blipTech1.ring).to.equal('Assess');
                    expect(blipTech1.numberOfVotes).to.equal(3);
                    expect(blipTech1.votes.length).to.equal(2);
                    expect(blipTech1.votes.find(v => v.ring === 'Assess').count).to.equal(2);
                    expect(blipTech1.votes.find(v => v.ring === 'Trial').count).to.equal(1);
                    const blipTech2 = blips.find(b => b.name === TEST_TECHNOLOGIES[2].name);
                    expect(blipTech2.ring).to.equal('Adopt');
                    expect(blipTech2.numberOfVotes).to.equal(2);
                    expect(blipTech2.votes.length).to.equal(1);
                    expect(blipTech2.votes.find(v => v.ring === 'Adopt').count).to.equal(2);
                    cachedDb.client.close();
                    done();
                },
                err => {
                    cachedDb.client.close();
                    done(err);
                },
            );
    }).timeout(20000);

    it('1.6 saves some votes, calculates the blips and finds that there are some technologies for revote', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        const votingEventName = 'event B';
        let votes: VoteCredentialized[];
        let votingEvent;

        let votingEventId;
        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventName)),
                tap(id => (votingEventId = id)),
                concatMap(() => readVotingEvent(cachedDb, votingEventId)),
                tap(_vEvent => {
                    const tech0 = _vEvent.technologies[0];
                    const tech1 = _vEvent.technologies[1];
                    votingEvent = { name: votingEventName, _id: votingEventId, round: 1 };
                    votes = [
                        {
                            credentials: { votingEvent, voterId: { firstName: 'one B', lastName: 'two B' } },
                            votes: [
                                {
                                    ring: 'Hold',
                                    technology: tech0,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent, voterId: { firstName: 'three B', lastName: 'four B' } },
                            votes: [
                                {
                                    ring: 'Assess',
                                    technology: tech0,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent, voterId: { firstName: 'five B', lastName: 'six B' } },
                            votes: [
                                {
                                    ring: 'Hold',
                                    technology: tech0,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent, voterId: { firstName: 'seven B', lastName: 'eight B' } },
                            votes: [
                                {
                                    ring: 'Assess',
                                    technology: tech0,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent, voterId: { firstName: 'ninth B', lastName: 'tenth B' } },
                            votes: [
                                {
                                    ring: 'Assess',
                                    technology: tech1,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent,
                                voterId: { firstName: 'eleventh B', lastName: 'twelfth B' },
                            },
                            votes: [
                                {
                                    ring: 'Trial',
                                    technology: tech1,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent,
                                voterId: { firstName: 'thirteen B', lastName: 'fourteen B' },
                            },
                            votes: [
                                {
                                    ring: 'Assess',
                                    technology: tech1,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                    ];
                }),
                switchMap(() => forkJoin(votes.map(vote => mongodbService(cachedDb, ServiceNames.saveVotes, vote)))),
                switchMap(() => mongodbService(cachedDb, ServiceNames.calculateBlips, { votingEvent })),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
            )
            .subscribe(
                votingEvent => {
                    const techToRevote = votingEvent.technologies.filter(t => t.forRevote);
                    expect(techToRevote.length).to.equal(1);
                    cachedDb.client.close();
                    done();
                },
                err => {
                    cachedDb.client.close();
                    done(err);
                },
            );
    }).timeout(30000);

    it('1.7 saves some votes on different voting events and calculates the blips for all events', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const votingEventName1 = 'event Aaa';
        const votingEventName2 = 'event Bbb';
        let votes: VoteCredentialized[];

        let votingEventId1;
        let votingEventId2;
        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventName1)),
                tap(votingEventId => (votingEventId1 = votingEventId)),
                switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventName2)),
                tap(votingEventId => (votingEventId2 = votingEventId)),
                switchMap(() =>
                    forkJoin(
                        mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId1),
                        mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId2),
                    ),
                ),
                tap(([vEvent1, vEvent2]) => {
                    votes = [
                        {
                            credentials: { votingEvent: vEvent1, voterId: { firstName: 'one A', lastName: 'two A' } },
                            votes: [{ ring: 'Hold', technology: TEST_TECHNOLOGIES[0], eventRound: 1 }],
                        },
                        {
                            credentials: {
                                votingEvent: vEvent1,
                                voterId: { firstName: 'three A', lastName: 'four A' },
                            },
                            votes: [{ ring: 'Trial', technology: TEST_TECHNOLOGIES[0], eventRound: 1 }],
                        },
                        {
                            credentials: { votingEvent: vEvent1, voterId: { firstName: 'five A', lastName: 'six A' } },
                            votes: [{ ring: 'Assess', technology: TEST_TECHNOLOGIES[1], eventRound: 1 }],
                        },
                        {
                            credentials: {
                                votingEvent: vEvent2,
                                voterId: { firstName: 'seven A', lastName: 'eight A' },
                            },
                            votes: [{ ring: 'Assess', technology: TEST_TECHNOLOGIES[1], eventRound: 1 }],
                        },
                        {
                            credentials: {
                                votingEvent: vEvent2,
                                voterId: { firstName: 'seven A', lastName: 'eight A' },
                            },
                            votes: [{ ring: 'Hold', technology: TEST_TECHNOLOGIES[0], eventRound: 1 }],
                        },
                    ];
                }),

                switchMap(() => forkJoin(votes.map(vote => mongodbService(cachedDb, ServiceNames.saveVotes, vote)))),
                switchMap(() => mongodbService(cachedDb, ServiceNames.calculateBlipsFromAllEvents)),
            )
            .subscribe(
                (blips: Blip[]) => {
                    expect(blips.length).to.equal(2);
                    const blipForTech0 = blips.find(b => b.name === TEST_TECHNOLOGIES[0].name);
                    expect(blipForTech0.numberOfVotes).to.equal(3);
                    expect(blipForTech0.ring).to.equal('Hold');
                    const blipForTech1 = blips.find(b => b.name === TEST_TECHNOLOGIES[1].name);
                    expect(blipForTech1.numberOfVotes).to.equal(2);
                    expect(blipForTech1.ring).to.equal('Assess');
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
    }).timeout(20000);

    it('1.8 saves some votes on different voting events and reads the comments', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const votingEventNameA = 'event with comments A';
        const votingEventNameB = 'event with comments B';
        let votes: VoteCredentialized[];

        let tech1: Technology = {
            _id: '000000000000000000000000',
            name: '1% canary',
            quadrant: 'Techniques',
            isNew: false,
            description: 'First tech',
        };
        let tech2: Technology = {
            _id: '111111111111111111111111',
            name: '.NET Core',
            quadrant: 'Platforms',
            isNew: false,
            description: 'Second tech',
        };
        let votingEventIdA;
        let votingEventIdB;

        const comment1A = 'I am the comment of One A';
        const comment3A = 'I am the comment of Three A';
        const comment1B = 'I am the comment of One B';
        const comment2B = 'I am the comment of Two B';

        const ringForTech2AtVotingEventB = 'Assess';

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventNameA)),
                tap(votingEventId => (votingEventIdA = votingEventId)),
                switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventNameB)),
                tap(votingEventId => (votingEventIdB = votingEventId)),

                switchMap(() =>
                    forkJoin(
                        mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventIdA),
                        mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventIdB),
                    ),
                ),
                // we create 5 votes, 3 for the votingEventA and 2 for the votingEventB
                // all votes are for tech1 with the exception of the last which is for tech2
                // 2 votes for votingEventA have a comment and one does not have a comment
                // 2 votes for votingEventB have a comment
                tap(([vEventA, vEventB]) => {
                    votes = [
                        {
                            credentials: {
                                votingEvent: vEventA,
                                voterId: { firstName: 'one A', lastName: 'one A' },
                            },
                            votes: [
                                {
                                    ring: 'Hold',
                                    technology: tech1,
                                    eventRound: 1,
                                    comment: { text: comment1A },
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent: vEventA,
                                voterId: { firstName: 'two A', lastName: 'two A' },
                            },
                            votes: [{ ring: 'Hold', technology: tech1, eventRound: 1 }],
                        },
                        {
                            credentials: {
                                votingEvent: vEventA,
                                voterId: { firstName: 'three A', lastName: 'three A' },
                            },
                            votes: [
                                {
                                    ring: 'Hold',
                                    technology: tech1,
                                    eventRound: 1,
                                    comment: { text: comment3A },
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent: vEventB,
                                voterId: { firstName: 'one B', lastName: 'one B' },
                            },
                            votes: [
                                {
                                    ring: 'Assess',
                                    technology: tech1,
                                    eventRound: 1,
                                    comment: { text: comment1B },
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent: vEventB,
                                voterId: { firstName: 'two B', lastName: 'two B' },
                            },
                            votes: [
                                {
                                    ring: ringForTech2AtVotingEventB,
                                    technology: tech2,
                                    eventRound: 1,
                                    comment: { text: comment2B },
                                },
                            ],
                        },
                    ];
                }),
                switchMap(() => forkJoin(votes.map(vote => mongodbService(cachedDb, ServiceNames.saveVotes, vote)))),
                // now we retrieve all the comments for tech1 and votingEventA
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.getVotesCommentsForTech, {
                        technologyId: tech1._id,
                        eventId: votingEventIdA,
                    }),
                ),
                tap((comments: Comment[]) => {
                    expect(comments.length).to.equal(2);
                }),
                // now we retrieve all the comments for tech2 and votingEventB
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.getVotesCommentsForTech, {
                        technologyId: tech2._id,
                        eventId: votingEventIdB,
                    }),
                ),
                tap((comments: Comment[]) => {
                    expect(comments.length).to.equal(1);
                    expect(comments[0].text).to.equal(comment2B);
                }),
                // now we retrieve all the comments for tech1 for all voting events
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.getVotesCommentsForTech, {
                        technologyId: tech1._id,
                    }),
                ),
                tap((comments: Comment[]) => {
                    expect(comments.length).to.equal(3);
                }),
                // now we retrieve all the votes for tech1 and votingEventA which have comments
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.getVotesWithCommentsForTechAndEvent, {
                        technologyId: tech1._id,
                        eventId: votingEventIdA,
                    }),
                ),
                tap((votes: Vote[]) => {
                    expect(votes.length).to.equal(2);
                }),
                // now we retrieve all the votes for tech2 and votingEventB which have comments
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.getVotesWithCommentsForTechAndEvent, {
                        technologyId: tech2._id,
                        eventId: votingEventIdB,
                    }),
                ),
                tap((votes: Vote[]) => {
                    expect(votes.length).to.equal(1);
                    expect(votes[0].ring).to.equal(ringForTech2AtVotingEventB);
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
    }).timeout(20000);

    it('1.9 saves some votes and then calculates the blips for only one event when votingEvent given ', done => {
        let firstVotingEvent;
        let secondVotingEvent;

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        let firstVotingEventId;
        let secondVotingEventId;

        let votes: VoteCredentialized[];

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createAndOpenVotingEvent(cachedDb, 'event A')),
                tap(votingEventId => (firstVotingEventId = votingEventId)),
                switchMap(() => createAndOpenVotingEvent(cachedDb, 'event B')),
                tap(votingEventId => (secondVotingEventId = votingEventId)),
                tap(() => {
                    firstVotingEvent = { name: 'event A', _id: firstVotingEventId, round: 1 };
                    secondVotingEvent = { name: 'event B', _id: secondVotingEventId, round: 2 };
                    votes = [
                        {
                            credentials: {
                                votingEvent: secondVotingEvent,
                                voterId: { firstName: 'one A', lastName: 'two A' },
                            },
                            votes: [
                                {
                                    ring: 'Hold',
                                    technology: TEST_TECHNOLOGIES[0],
                                    eventName: secondVotingEvent.name,
                                    eventId: secondVotingEvent._id,
                                    eventRound: 2,
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent: secondVotingEvent,
                                voterId: { firstName: 'three A', lastName: 'four A' },
                            },
                            votes: [
                                {
                                    ring: 'Assess',
                                    technology: TEST_TECHNOLOGIES[0],
                                    eventName: secondVotingEvent.name,
                                    eventId: secondVotingEvent._id,
                                    eventRound: 2,
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent: firstVotingEvent,
                                voterId: { firstName: 'five A', lastName: 'six A' },
                            },
                            votes: [
                                {
                                    ring: 'Hold',
                                    technology: TEST_TECHNOLOGIES[0],
                                    eventName: firstVotingEvent.name,
                                    eventId: firstVotingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent: firstVotingEvent,
                                voterId: { firstName: 'seven A', lastName: 'eight A' },
                            },
                            votes: [
                                {
                                    ring: 'Assess',
                                    technology: TEST_TECHNOLOGIES[1],
                                    eventName: firstVotingEvent.name,
                                    eventId: firstVotingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent: firstVotingEvent,
                                voterId: { firstName: 'ninth A', lastName: 'tenth A' },
                            },
                            votes: [
                                {
                                    ring: 'Assess',
                                    technology: TEST_TECHNOLOGIES[1],
                                    eventName: firstVotingEvent.name,
                                    eventId: firstVotingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent: firstVotingEvent,
                                voterId: { firstName: 'eleventh A', lastName: 'twelfth A' },
                            },
                            votes: [
                                {
                                    ring: 'Trial',
                                    technology: TEST_TECHNOLOGIES[1],
                                    eventName: firstVotingEvent.name,
                                    eventId: firstVotingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent: firstVotingEvent,
                                voterId: { firstName: 'thirteenth A', lastName: 'fourteenth A' },
                            },
                            votes: [
                                {
                                    ring: 'Adopt',
                                    technology: TEST_TECHNOLOGIES[2],
                                    eventName: firstVotingEvent.name,
                                    eventId: firstVotingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent: firstVotingEvent,
                                voterId: { firstName: 'fifteenth A', lastName: 'sixteenth A' },
                            },
                            votes: [
                                {
                                    ring: 'Adopt',
                                    technology: TEST_TECHNOLOGIES[2],
                                    eventName: firstVotingEvent.name,
                                    eventId: firstVotingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                    ];
                }),
                switchMap(() => forkJoin(votes.map(vote => mongodbService(cachedDb, ServiceNames.saveVotes, vote)))),
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.calculateBlips, { votingEvent: secondVotingEvent }),
                ),
            )
            .subscribe(
                blips => {
                    expect(blips.length).to.equal(1);
                    const blipTech0 = blips.find(b => b.name === TEST_TECHNOLOGIES[0].name);
                    expect(blipTech0.ring).to.equal('Hold');
                    expect(blipTech0.numberOfVotes).to.equal(2);
                    expect(blipTech0.votes.length).to.equal(2);
                    cachedDb.client.close();
                    done();
                },
                err => {
                    cachedDb.client.close();
                    done(err);
                },
            );
    }).timeout(20000);

    it('1.10 calculates blips and get empty list of blips when voting event does not match', done => {
        let firstVotingEvent;
        let secondVotingEvent;

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        let firstVotingEventId;
        let secondVotingEventId;

        let votes: VoteCredentialized[];

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createAndOpenVotingEvent(cachedDb, 'event A')),
                tap(votingEventId => (firstVotingEventId = votingEventId)),
                switchMap(() => createAndOpenVotingEvent(cachedDb, 'event B')),
                tap(votingEventId => (secondVotingEventId = votingEventId)),
                tap(() => {
                    firstVotingEvent = { name: 'event A', _id: firstVotingEventId, round: 1 };
                    secondVotingEvent = { name: 'event B', _id: secondVotingEventId, round: 2 };
                    votes = [
                        {
                            credentials: {
                                votingEvent: firstVotingEvent,
                                voterId: { firstName: 'one A', lastName: 'two A' },
                            },
                            votes: [
                                {
                                    ring: 'Hold',
                                    technology: TEST_TECHNOLOGIES[0],
                                    eventName: firstVotingEvent.name,
                                    eventId: firstVotingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent: firstVotingEvent,
                                voterId: { firstName: 'three A', lastName: 'four A' },
                            },
                            votes: [
                                {
                                    ring: 'Assess',
                                    technology: TEST_TECHNOLOGIES[0],
                                    eventName: firstVotingEvent.name,
                                    eventId: firstVotingEvent._id,
                                    eventRound: 2,
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent: firstVotingEvent,
                                voterId: { firstName: 'five A', lastName: 'six A' },
                            },
                            votes: [
                                {
                                    ring: 'Hold',
                                    technology: TEST_TECHNOLOGIES[0],
                                    eventName: firstVotingEvent.name,
                                    eventId: firstVotingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent: firstVotingEvent,
                                voterId: { firstName: 'seven A', lastName: 'eight A' },
                            },
                            votes: [
                                {
                                    ring: 'Assess',
                                    technology: TEST_TECHNOLOGIES[1],
                                    eventName: firstVotingEvent.name,
                                    eventId: firstVotingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent: firstVotingEvent,
                                voterId: { firstName: 'ninth A', lastName: 'tenth A' },
                            },
                            votes: [
                                {
                                    ring: 'Assess',
                                    technology: TEST_TECHNOLOGIES[1],
                                    eventName: firstVotingEvent.name,
                                    eventId: firstVotingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent: firstVotingEvent,
                                voterId: { firstName: 'eleventh A', lastName: 'twelfth A' },
                            },
                            votes: [
                                {
                                    ring: 'Trial',
                                    technology: TEST_TECHNOLOGIES[1],
                                    eventName: firstVotingEvent.name,
                                    eventId: firstVotingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent: firstVotingEvent,
                                voterId: { firstName: 'thirteenth A', lastName: 'fourteenth A' },
                            },
                            votes: [
                                {
                                    ring: 'Adopt',
                                    technology: TEST_TECHNOLOGIES[2],
                                    eventName: firstVotingEvent.name,
                                    eventId: firstVotingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                        {
                            credentials: {
                                votingEvent: firstVotingEvent,
                                voterId: { firstName: 'fifteenth A', lastName: 'sixteenth A' },
                            },
                            votes: [
                                {
                                    ring: 'Adopt',
                                    technology: TEST_TECHNOLOGIES[2],
                                    eventName: firstVotingEvent.name,
                                    eventId: firstVotingEvent._id,
                                    eventRound: 1,
                                },
                            ],
                        },
                    ];
                }),
                switchMap(() => forkJoin(votes.map(vote => mongodbService(cachedDb, ServiceNames.saveVotes, vote)))),
                switchMap(() =>
                    mongodbService(cachedDb, ServiceNames.calculateBlips, { votingEvent: secondVotingEvent }),
                ),
            )
            .subscribe(
                blips => {
                    expect(blips.length).to.equal(0);
                    cachedDb.client.close();
                    done();
                },
                err => {
                    cachedDb.client.close();
                    done(err);
                },
            );
    }).timeout(20000);

    it('1.11 saves one vote with comment and then adds a reply to the comment', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const votingEventName = 'this event with comments';
        const credentials = {
            votingEvent: null,
            voterId: { firstName: 'one-comment', lastName: 'two-comment' },
        };
        let credentializedVote: VoteCredentialized;

        const replyText = 'I am the reply';

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventName)),
                switchMap(votingEventId => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap(vEvent => {
                    credentials.votingEvent = vEvent;
                    credentializedVote = {
                        credentials,
                        votes: [
                            {
                                ring: 'Hold',
                                technology: TEST_TECHNOLOGIES[0],
                                eventName: credentials.votingEvent.name,
                                eventId: credentials.votingEvent._id,
                                eventRound: 1,
                                comment: { text: 'I am the first comment' },
                            },
                        ],
                    };
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.saveVotes, credentializedVote)),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotes)),
                concatMap(votes => {
                    const theVote = votes[0];
                    const voteId = theVote._id.toHexString();
                    const commentReceivingReplyId = theVote.comment.id;
                    const reply: Comment = {
                        text: replyText,
                    };
                    const params = { voteId, reply, commentReceivingReplyId };
                    return mongodbService(cachedDb, ServiceNames.addReplyToVoteComment, params);
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotes)),
                tap((votes: Vote[]) => {
                    const theVote = votes[0];
                    expect(theVote.comment).to.be.not.undefined;
                    expect(theVote.comment.replies).to.be.not.undefined;
                    expect(theVote.comment.replies.length).to.equal(1);
                    expect(theVote.comment.replies[0].text).to.equal(replyText);
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
    }).timeout(20000);

    it('2.0 saves one vote with comment, adds a reply to the comment and then a reply to the reply', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const votingEventName = 'this event with comments and replies to replies';
        const credentials = {
            votingEvent: null,
            voterId: { firstName: 'one-comment-rep', lastName: 'two-comment-rep' },
        };
        let credentializedVote: VoteCredentialized;

        const replyToReplyText = 'I am the reply to the reply';

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventName)),
                switchMap(votingEventId => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap(vEvent => {
                    credentials.votingEvent = vEvent;
                    credentializedVote = {
                        credentials,
                        votes: [
                            {
                                ring: 'Hold',
                                technology: TEST_TECHNOLOGIES[0],
                                eventName: credentials.votingEvent.name,
                                eventId: credentials.votingEvent._id,
                                eventRound: 1,
                                comment: { text: 'I am the first comment' },
                            },
                        ],
                    };
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.saveVotes, credentializedVote)),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotes)),
                concatMap(votes => {
                    const theVote = votes[0];
                    const voteId = theVote._id.toHexString();
                    const commentReceivingReplyId = theVote.comment.id;
                    const reply: Comment = {
                        text: 'I am the first reply',
                    };
                    const params = { voteId, reply, commentReceivingReplyId };
                    return mongodbService(cachedDb, ServiceNames.addReplyToVoteComment, params);
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotes)),
                concatMap((votes: Vote[]) => {
                    const theVote = votes[0];
                    const voteId = theVote._id.toHexString();
                    const commentReceivingReplyId = theVote.comment.replies[0].id;
                    const reply: Comment = {
                        text: replyToReplyText,
                    };
                    const params = { voteId, reply, commentReceivingReplyId };
                    return mongodbService(cachedDb, ServiceNames.addReplyToVoteComment, params);
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotes)),
                tap((votes: Vote[]) => {
                    const theVote = votes[0];
                    expect(theVote.comment).to.be.not.undefined;
                    expect(theVote.comment.replies).to.be.not.undefined;
                    expect(theVote.comment.replies.length).to.equal(1);
                    expect(theVote.comment.replies[0].replies.length).to.equal(1);
                    expect(theVote.comment.replies[0].replies[0].text).to.equal(replyToReplyText);
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
    }).timeout(20000);

    it('2.1 saves one vote with comment, adds a reply to the comment and then a second reply to the comment', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const votingEventName = 'this event with a vote with 2 comments';
        const credentials = {
            votingEvent: null,
            voterId: { firstName: 'one-comment-2-comm', lastName: 'two-comment-2-comm' },
        };
        let credentializedVote: VoteCredentialized;

        const secondReplyTeext = 'I am the second reply to the comment';

        let votingEventId;
        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventName)),
                switchMap(votingEventId => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap(vEvent => {
                    credentials.votingEvent = vEvent;
                    credentializedVote = {
                        credentials,
                        votes: [
                            {
                                ring: 'Hold',
                                technology: TEST_TECHNOLOGIES[0],
                                eventName: credentials.votingEvent.name,
                                eventId: credentials.votingEvent._id,
                                eventRound: 1,
                                comment: { text: 'I am the first comment' },
                            },
                        ],
                    };
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.saveVotes, credentializedVote)),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotes, { eventId: votingEventId })),
                concatMap(votes => {
                    const theVote = votes[0];
                    const voteId = theVote._id.toHexString();
                    const commentReceivingReplyId = theVote.comment.id;
                    const reply: Comment = {
                        text: 'I am the first reply',
                    };
                    const params = { voteId, reply, commentReceivingReplyId };
                    return mongodbService(cachedDb, ServiceNames.addReplyToVoteComment, params);
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotes, { eventId: votingEventId })),
                concatMap((votes: Vote[]) => {
                    const theVote = votes[0];
                    const voteId = theVote._id.toHexString();
                    const topCommentReceivingSecondReply = theVote.comment.id;
                    const reply: Comment = {
                        text: secondReplyTeext,
                    };
                    const params = { voteId, reply, commentReceivingReplyId: topCommentReceivingSecondReply };
                    return mongodbService(cachedDb, ServiceNames.addReplyToVoteComment, params);
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotes, { eventId: votingEventId })),
                tap((votes: Vote[]) => {
                    const theVote = votes[0];
                    expect(theVote.comment).to.be.not.undefined;
                    expect(theVote.comment.replies).to.be.not.undefined;
                    expect(theVote.comment.replies.length).to.equal(2);
                    expect(theVote.comment.replies[0].replies).to.be.undefined;
                    expect(theVote.comment.replies[1].replies).to.be.undefined;
                    expect(theVote.comment.replies[1].text).to.equal(secondReplyTeext);
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
    }).timeout(20000);

    it('2.2 tries to save a reply to comment but the vote identified by the voteId does not exist', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const voteId = null;
        const commentReceivingReplyId = '123';
        const reply: Comment = {
            text: 'I am a reply',
        };
        const params = { voteId, reply, commentReceivingReplyId };

        mongodbService(cachedDb, ServiceNames.addReplyToVoteComment, params).subscribe(
            data => {
                const err = 'Should not pass through here - test 2.2 - data: ' + data;
                cachedDb.client.close();
                done(err);
            },
            err => {
                expect(err).to.be.not.undefined;
                cachedDb.client.close();
                done();
            },
            () => {
                const err = 'Should not complete - test 2.2 - data: ';
                cachedDb.client.close();
                done(err);
            },
        );
    }).timeout(20000);

    it('2.3 saves one vote with comment, then tries to add a reply to the comment with the wrong commentId', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const votingEventName = 'the event where we try to add a reply with the wrong commentId';
        const credentials = {
            votingEvent: null,
            voterId: { firstName: 'one-no-comment', lastName: 'two-no-comment' },
        };
        let credentializedVote: VoteCredentialized;

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                switchMap(() => createAndOpenVotingEvent(cachedDb, votingEventName)),
                switchMap(votingEventId => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap(vEvent => {
                    credentials.votingEvent = vEvent;
                    credentializedVote = {
                        credentials,
                        votes: [
                            {
                                ring: 'Hold',
                                technology: TEST_TECHNOLOGIES[0],
                                eventName: credentials.votingEvent.name,
                                eventId: credentials.votingEvent._id,
                                eventRound: 1,
                                comment: { text: 'I am the first comment' },
                            },
                        ],
                    };
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.saveVotes, credentializedVote)),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotes)),
                concatMap(votes => {
                    const theVote = votes[0];
                    const voteId = theVote._id.toHexString();
                    const commentReceivingReplyId = 'the wrong id';
                    const reply: Comment = {
                        text: 'I am the first reply',
                    };
                    const params = { voteId, reply, commentReceivingReplyId };
                    return mongodbService(cachedDb, ServiceNames.addReplyToVoteComment, params);
                }),
            )
            .subscribe(
                data => {
                    const err = 'Should not pass through here - test 2.3 - data: ' + data;
                    cachedDb.client.close();
                    done(err);
                },
                err => {
                    expect(err).to.be.not.undefined;
                    cachedDb.client.close();
                    done();
                },
                () => {
                    const err = 'Should not complete - test 2.3 - data: ';
                    cachedDb.client.close();
                    done(err);
                },
            );
    }).timeout(20000);

    it(`2.4 the voters have defined Adopt as the ring for a technology but a recommendation overrides 
    this result and sets to Hold the ring for this technology - the recommender sets also a recommendation
    for a technology which has received no vote`, done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        const votingEventName = 'Recommender overrides voters';
        let votes: VoteCredentialized[];
        let votingEventId;
        let votingEvent;

        let tech0: Technology;
        let tech1: Technology;
        let tech2: Technology;

        const recommenderId = 'I am the recommender';
        const recommender: User = { user: recommenderId };

        let headers;

        const ringSetByVotersAndOverriddenByRecommender = 'Adopt';
        const ringSetByRecommender = 'Hold';
        const ringNotOverridenByRecommender = 'Trial';

        cleanVotingEventsAndVotesCollections(cachedDb.dbName)
            .pipe(
                concatMap(() => createAndOpenVotingEvent(cachedDb, votingEventName)),
                tap(_votingEventId => (votingEventId = _votingEventId)),
                concatMap(() =>
                    addUsers(cachedDb.db.collection(config.usersCollection), {
                        users: [recommender],
                    }),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, votingEventId)),
                tap((_votingEvent: VotingEvent) => {
                    votingEvent = _votingEvent;
                    tech0 = _votingEvent.technologies[0];
                    tech1 = _votingEvent.technologies[1];
                    tech2 = _votingEvent.technologies[2];
                    const votingEventData = {
                        name: _votingEvent.name,
                        _id: _votingEvent._id,
                        round: _votingEvent.round,
                    };

                    votes = [
                        {
                            credentials: { votingEvent: votingEventData, voterId: { nickname: 'Nick1' } },
                            votes: [
                                {
                                    ring: ringSetByVotersAndOverriddenByRecommender,
                                    technology: tech0,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: _votingEvent.round,
                                },
                                {
                                    ring: ringNotOverridenByRecommender,
                                    technology: tech1,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: _votingEvent.round,
                                },
                            ],
                        },
                        {
                            credentials: { votingEvent: votingEventData, voterId: { nickname: 'Nick2' } },
                            votes: [
                                {
                                    ring: ringSetByVotersAndOverriddenByRecommender,
                                    technology: tech0,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: _votingEvent.round,
                                },
                                {
                                    ring: ringNotOverridenByRecommender,
                                    technology: tech1,
                                    eventName: votingEvent.name,
                                    eventId: votingEvent._id,
                                    eventRound: _votingEvent.round,
                                },
                            ],
                        },
                    ];
                }),
                concatMap(() => forkJoin(votes.map(vote => mongodbService(cachedDb, ServiceNames.saveVotes, vote)))),
                // the Recommender logs in
                concatMap(() => authenticateForTest(cachedDb, recommender.user, 'pwd')),
                tap(_headers => (headers = _headers)),
                // the Recommender sets itself as the recommendation author for tech0
                concatMap(() =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.setRecommendationAuthor,
                        {
                            votingEventId: votingEvent._id,
                            technologyName: tech0.name,
                        },
                        null,
                        headers,
                    ),
                ),
                // then sets the actual recommendation
                concatMap(() => {
                    const recommendation: Recommendation = {
                        author: recommenderId,
                        text: 'This is CRAP',
                        ring: ringSetByRecommender,
                        timestamp: 'now',
                    };
                    return mongodbService(
                        cachedDb,
                        ServiceNames.setRecommendation,
                        {
                            votingEventId: votingEvent._id,
                            technologyName: tech0.name,
                            recommendation,
                        },
                        null,
                        headers,
                    );
                }),
                // the recommeneder sets also a recommendation fot a technology which has received no votes
                concatMap(() =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.setRecommendationAuthor,
                        {
                            votingEventId: votingEvent._id,
                            technologyName: tech2.name,
                        },
                        null,
                        headers,
                    ),
                ),
                concatMap(() => {
                    const recommendation: Recommendation = {
                        author: recommenderId,
                        text: 'This is also CRAP',
                        ring: ringSetByRecommender,
                        timestamp: 'now',
                    };
                    return mongodbService(
                        cachedDb,
                        ServiceNames.setRecommendation,
                        {
                            votingEventId: votingEvent._id,
                            technologyName: tech2.name,
                            recommendation,
                        },
                        null,
                        headers,
                    );
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.calculateBlips, { votingEvent })),
            )
            .subscribe(
                (blips: Blip[]) => {
                    expect(blips.length).to.equal(3);
                    const blipTech0 = blips.find(b => b.name === tech0.name);
                    expect(blipTech0.ring).to.equal(ringSetByRecommender);
                    const blipTech1 = blips.find(b => b.name === tech1.name);
                    expect(blipTech1.ring).to.equal(ringNotOverridenByRecommender);
                    const blipTech2 = blips.find(b => b.name === tech2.name);
                    expect(blipTech2.ring).to.equal(ringSetByRecommender);
                    cachedDb.client.close();
                    done();
                },
                err => {
                    cachedDb.client.close();
                    done(err);
                },
            );
    }).timeout(20000);
});
