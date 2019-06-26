import { expect } from 'chai';
import { countVoters } from './count-voters';
import { ServiceNames } from '../../service-names';
import { mongodbService, CachedDB } from '../../api/service';
import { initializeVotingEventsAndVotes } from '../base.spec';
import { switchMap, tap, defaultIfEmpty } from 'rxjs/operators';
import { config } from '../../api/config';
import { getVotingEvents } from '../../api/voting-event-apis';
import { forkJoin } from 'rxjs';
import { TEST_TECHNOLOGIES } from '../../model/technologies.local-data';

describe('Script count voters', () => {
    describe('for existing events', () => {
        it('should return the count of voters for each event', done => {
            const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
            const firstVotingEvent = { name: 'First voting event ' + new Date().getTime() };
            const secondVotingEvent = { name: 'Second voting event ' + new Date().getTime() };
            const thirdVotingEvent = { name: 'Third voting event ' + new Date().getTime() };
            const aVoter = { firstName: 'a', lastName: 'b' };
            const anotherVoter = { firstName: 'c', lastName: 'd' };
            let firstVotingEventId: string;
            let secondVotingEventId: string;
            let thirdVotingEventId: string;
            initializeVotingEventsAndVotes(cachedDb.dbName)
                .pipe(
                    switchMap(() =>
                        forkJoin(
                            mongodbService(cachedDb, ServiceNames.createVotingEvent, firstVotingEvent).pipe(
                                switchMap(_id => {
                                    firstVotingEventId = _id.toHexString();
                                    return mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id });
                                }),
                            ),
                            mongodbService(cachedDb, ServiceNames.createVotingEvent, secondVotingEvent).pipe(
                                switchMap(_id => {
                                    secondVotingEventId = _id.toHexString();
                                    return mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id });
                                }),
                            ),
                            mongodbService(cachedDb, ServiceNames.createVotingEvent, thirdVotingEvent).pipe(
                                switchMap(_id => {
                                    thirdVotingEventId = _id.toHexString();
                                    return mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id });
                                }),
                            ),
                        ),
                    ),
                    switchMap(() => getVotingEvents(cachedDb.db.collection(config.votingEventsCollection))),
                    tap(
                        votingEvents => expect(votingEvents.filter(e => e.status === 'open').length).to.equal(3),
                        err => done(err),
                    ),
                    switchMap(() =>
                        forkJoin(
                            mongodbService(cachedDb, ServiceNames.saveVotes, {
                                credentials: {
                                    votingEvent: { _id: secondVotingEventId },
                                    voterId: aVoter,
                                },
                                votes: [
                                    {
                                        ring: 'hold',
                                        technology: TEST_TECHNOLOGIES[0],
                                    },
                                ],
                            }),
                            mongodbService(cachedDb, ServiceNames.saveVotes, {
                                credentials: {
                                    votingEvent: { _id: thirdVotingEventId },
                                    voterId: aVoter,
                                },
                                votes: [
                                    {
                                        ring: 'assess',
                                        technology: TEST_TECHNOLOGIES[0],
                                    },
                                ],
                            }),
                            mongodbService(cachedDb, ServiceNames.saveVotes, {
                                credentials: {
                                    votingEvent: { _id: thirdVotingEventId },
                                    voterId: anotherVoter,
                                },
                                votes: [
                                    {
                                        ring: 'hold',
                                        technology: TEST_TECHNOLOGIES[0],
                                    },
                                ],
                            }),
                        ),
                    ),
                    switchMap(() => mongodbService(cachedDb, ServiceNames.getVotes)),
                    tap(votes => expect(votes.length).to.equal(3)),
                    switchMap(() =>
                        forkJoin(
                            countVoters(firstVotingEventId).pipe(defaultIfEmpty({ numberOfVoters: 0 })),
                            countVoters(secondVotingEventId),
                            countVoters(thirdVotingEventId),
                        ),
                    ),
                    tap(votersCounts => {
                        expect(votersCounts[0].numberOfVoters).to.equal(0);
                        expect(votersCounts[1].numberOfVoters).to.equal(1);
                        expect(votersCounts[2].numberOfVoters).to.equal(2);
                    }),
                    switchMap(() => countVoters()),
                )
                .subscribe(
                    (votersCount: any) => {
                        if (votersCount.votingEvent === firstVotingEvent.name) {
                            expect(votersCount.numberOfVoters).to.equal(0);
                        } else if (votersCount.votingEvent === secondVotingEvent.name) {
                            expect(votersCount.numberOfVoters).to.equal(1);
                        } else if (votersCount.votingEvent === thirdVotingEvent.name) {
                            expect(votersCount.numberOfVoters).to.equal(2);
                        } else {
                            done(`Voting event ${votersCount.votingEvent} is unexpected`);
                        }
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
        });
    });

    describe('for a not existing event', () => {
        it('should do nothing', done => {
            countVoters('000000000000000000000000').subscribe(
                () => done('not expected to call next'),
                () => done('not expected to return error'),
                () => done(),
            );
        });
    });
});
