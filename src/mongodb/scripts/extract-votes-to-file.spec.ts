import { expect } from 'chai';
import { extractVotesToFile } from './extract-votes-to-file';
import { deleteFileObs, readLinesObs } from 'observable-fs';
import { catchError, switchMap, tap, map, mergeMap, last } from 'rxjs/operators';
import { of, throwError, forkJoin, from } from 'rxjs';
import { initializeVotingEventsAndVotes } from '../base.spec';
import { CachedDB, mongodbService } from '../../api/service';
import { config } from '../../api/config';
import { ServiceNames } from '../../service-names';
import { getVotingEvents } from '../../api/voting-event-apis';
import { createAndOpenVotingEvent } from '../test.utils';

const outputFilenames = [];

describe('Script extract votes to file', () => {
    afterEach(done => {
        from(outputFilenames)
            .pipe(
                mergeMap(outputFilename =>
                    deleteFileObs(outputFilename).pipe(
                        catchError(error => {
                            return error.code === 'ENOENT' ? of(null) : throwError(error);
                        }),
                    ),
                ),
            )
            .subscribe(null, err => done(err), () => done());
    });

    describe('for existing events', () => {
        it('should should write details to same file for each event', done => {
            const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
            const firstVotingEvent = { name: 'First voting event ' + new Date().getTime() };
            const secondVotingEvent = { name: 'Second voting event ' + new Date().getTime() };
            const thirdVotingEvent = { name: 'Third voting event ' + new Date().getTime() };
            const aVoter = { firstName: 'a', lastName: 'b' };
            const anotherVoter = { firstName: 'c', lastName: 'd' };
            let firstVotingEventId: string;
            let secondVotingEventId: string;
            let thirdVotingEventId: string;
            let aTech;
            let expectedFirstEventVotes;
            let expectedSecondEventVotes;
            let expectedThirdEventVotes;
            initializeVotingEventsAndVotes(cachedDb.dbName)
                .pipe(
                    switchMap(() => mongodbService(cachedDb, ServiceNames.getTechnologies)),
                    tap(data => {
                        aTech = data.technologies[0];
                        expectedFirstEventVotes = [''];
                        expectedSecondEventVotes = [
                            `${aTech.name},hold,${aTech.quadrant},${aTech.isNew},${secondVotingEvent.name}`,
                        ];
                        expectedThirdEventVotes = [
                            `${aTech.name},assess,${aTech.quadrant},${aTech.isNew},${thirdVotingEvent.name}`,
                            `${aTech.name},hold,${aTech.quadrant},${aTech.isNew},${thirdVotingEvent.name}`,
                        ];
                    }),
                    switchMap(() =>
                        forkJoin(
                            createAndOpenVotingEvent(cachedDb, firstVotingEvent.name),
                            createAndOpenVotingEvent(cachedDb, secondVotingEvent.name),
                            createAndOpenVotingEvent(cachedDb, thirdVotingEvent.name),
                        ),
                    ),
                    tap(([_firstVotingEventId, _secondVotingEventId, _thirdVotingEventId]) => {
                        firstVotingEventId = _firstVotingEventId.toHexString();
                        secondVotingEventId = _secondVotingEventId.toHexString();
                        thirdVotingEventId = _thirdVotingEventId.toHexString();
                    }),
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
                                        technology: aTech,
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
                                        technology: aTech,
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
                                        technology: aTech,
                                    },
                                ],
                            }),
                        ),
                    ),
                    switchMap(() => mongodbService(cachedDb, ServiceNames.getVotes)),
                    tap(votes => expect(votes.length).to.equal(3)),
                    switchMap(() =>
                        forkJoin(
                            extractVotesToFile('firstVotingEvent.out', firstVotingEventId).pipe(
                                tap(() => outputFilenames.push('firstVotingEvent.out')),
                                switchMap(() => readLinesObs('firstVotingEvent.out')),
                                map(firstVotingEventOutput => {
                                    expect(firstVotingEventOutput.length).to.equal(1);
                                    expect(firstVotingEventOutput).to.have.members(expectedFirstEventVotes);
                                }),
                            ),
                            extractVotesToFile('secondVotingEvent.out', secondVotingEventId).pipe(
                                tap(() => outputFilenames.push('secondVotingEvent.out')),
                                switchMap(() => readLinesObs('secondVotingEvent.out')),
                                map(secondVotingEventOutput => {
                                    expect(secondVotingEventOutput.length).to.equal(1);
                                    expect(secondVotingEventOutput).to.have.members(expectedSecondEventVotes);
                                }),
                            ),
                            extractVotesToFile('thirdVotingEvent.out', thirdVotingEventId).pipe(
                                tap(() => outputFilenames.push('thirdVotingEvent.out')),
                                switchMap(() => readLinesObs('thirdVotingEvent.out')),
                                map(secondVotingEventOutput => {
                                    expect(secondVotingEventOutput.length).to.equal(2);
                                    expect(secondVotingEventOutput).to.have.members(expectedThirdEventVotes);
                                }),
                            ),
                        ),
                    ),
                    switchMap(() => extractVotesToFile('allVotingEvents.out')),
                    last(),
                    tap(() => outputFilenames.push('allVotingEvents.out')),
                    switchMap(() => readLinesObs('allVotingEvents.out')),
                )
                .subscribe(
                    (allEventsOutput: any) => {
                        expect(allEventsOutput).to.have.members([
                            ...expectedFirstEventVotes,
                            ...expectedSecondEventVotes,
                            ...expectedThirdEventVotes,
                        ]);
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
    });

    describe('for a not existing event', () => {
        it('should should do nothing', done => {
            extractVotesToFile('notExistingVotingEvent.out', '000000000000000000000000').subscribe(
                () => done('not expected to call next'),
                () => done('not expected to return error'),
                () => done(),
            );
        });
    });
});
