import { expect } from 'chai';
import { ObjectId } from 'bson';
import { cancelVotingEvent } from './cancel-voting-event';
import { CachedDB, mongodbService } from '../../api/service';
import { config } from '../../api/config';
import { initializeVotingEventsAndVotes } from '../base.spec';
import { switchMap, tap } from 'rxjs/operators';
import { ServiceNames } from '../../service-names';
import { getAllVotingEvents } from '../../api/voting-event-apis';

describe('Script cancel voting event', () => {
    describe('for an existing event', () => {
        it('should cancel soft', done => {
            const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
            const newVotingEvent = { name: 'A voting event to be cancelled soft ' + new Date().getTime() };
            const cancelHard = false;
            initializeVotingEventsAndVotes(cachedDb.dbName)
                .pipe(
                    switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, newVotingEvent)),
                    switchMap(() => getAllVotingEvents(cachedDb.db.collection(config.votingEventsCollection))),
                    tap(
                        votingEvents => {
                            expect(votingEvents.length).to.equal(1);
                            expect(votingEvents[0]['cancelled']).to.be.undefined;
                        },
                        err => done(err),
                    ),
                    switchMap(votingEvents => {
                        return cancelVotingEvent(votingEvents[0]._id, cancelHard);
                    }),
                    switchMap(() => getAllVotingEvents(cachedDb.db.collection(config.votingEventsCollection))),
                )
                .subscribe(
                    votingEvents => {
                        expect(votingEvents.length).to.equal(1);
                        expect(votingEvents[0]['cancelled']).to.be.true;
                        cachedDb.client.close();
                        done();
                    },
                    err => {
                        cachedDb.client.close();
                        done(err);
                    },
                );
        });

        it('should cancel hard', done => {
            const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
            const newVotingEvent = { name: 'A voting event to be cancelled hard ' + new Date().getTime() };
            const cancelHard = true;
            initializeVotingEventsAndVotes(cachedDb.dbName)
                .pipe(
                    switchMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, newVotingEvent)),
                    switchMap(() => getAllVotingEvents(cachedDb.db.collection(config.votingEventsCollection))),
                    tap(
                        votingEvents => {
                            expect(votingEvents.length).to.equal(1);
                            expect(votingEvents[0]['cancelled']).to.be.undefined;
                        },
                        err => done(err),
                    ),
                    switchMap(votingEvents => {
                        return cancelVotingEvent(votingEvents[0]._id, cancelHard);
                    }),
                    switchMap(() => getAllVotingEvents(cachedDb.db.collection(config.votingEventsCollection))),
                )
                .subscribe(
                    votingEvents => {
                        expect(votingEvents.length).to.equal(0);
                        cachedDb.client.close();
                        done();
                    },
                    err => {
                        cachedDb.client.close();
                        done(err);
                    },
                );
        });
    });

    describe('for a not existing event', () => {
        it('should gracefully handle a soft cancellation attempt', done => {
            cancelVotingEvent(new ObjectId('000000000000000000000000'), false).subscribe(
                () => done(),
                err => done(err),
            );
        });

        it('should gracefully handle an hard cancellation attempt', done => {
            cancelVotingEvent(new ObjectId('000000000000000000000000'), true).subscribe(() => done(), err => done(err));
        });
    });
});
