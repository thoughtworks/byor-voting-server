import { expect } from 'chai';

import { CachedDB, mongodbService } from '../api/service';
import { config } from '../api/config';
import { ServiceNames } from '../service-names';
import { concatMap, tap } from 'rxjs/operators';
import { logError } from '../lib/utils';
import { Initiative } from '../model/initiative';
import { VotingEvent } from '../model/voting-event';
import { User } from '../model/user';
import {
    authenticateForTest,
    createVotingEventForTest,
    createInitiative,
    cancelInitiative,
    readInitiative,
    readVotingEvent,
    readVotingEvents,
} from './test.utils';

describe('1 - create read and delete initiatives', () => {
    it('Create an initiative, reads it and then delete it hard', done => {
        const initiativeName = 'The first initiative';
        const initiativeAdmin: User = { user: 'The admin of the first initiative' };

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        // first clean the db
        mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true })
            // then start the test
            .pipe(
                concatMap(() => createInitiative(cachedDb, initiativeName, initiativeAdmin)),
                concatMap(() => readInitiative(cachedDb, initiativeName)),
                tap((initiative: Initiative) => {
                    expect(initiative).to.be.not.undefined;
                    expect(initiative.name).equal(initiativeName);
                }),
                concatMap(() => cancelInitiative(cachedDb, initiativeName, { hard: true })),
                concatMap(() => readInitiative(cachedDb, initiativeName)),
                tap((initiative: Initiative) => {
                    expect(initiative).to.be.undefined;
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

    it('Create an initiative, reads it and then delete it soft', done => {
        const initiativeName = 'The second initiative';
        const initiativeAdmin: User = { user: 'The admin of the second initiative' };

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        // first clean the db
        mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true })
            // then start the test
            .pipe(
                concatMap(() => createInitiative(cachedDb, initiativeName, initiativeAdmin)),
                concatMap(() => readInitiative(cachedDb, initiativeName)),
                tap((initiative: Initiative) => {
                    expect(initiative).to.be.not.undefined;
                    expect(initiative.name).equal(initiativeName);
                }),
                concatMap(() => cancelInitiative(cachedDb, initiativeName)),
                // read without specifying any param, which means that the initiatives cancelled logically will not be read
                concatMap(() => readInitiative(cachedDb, initiativeName)),
                tap((initiative: Initiative) => {
                    expect(initiative).to.be.undefined;
                }),
                // read all initiatives, including the ones cancelled logically
                concatMap(() => readInitiative(cachedDb, initiativeName, { all: true })),
                tap((initiative: Initiative) => {
                    expect(initiative).to.be.not.undefined;
                }),
                // clean the db
                concatMap(() => cancelInitiative(cachedDb, initiativeName, { hard: true })),
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

describe('2 - create an Initiative and then a VotingEvent on this Initiative', () => {
    it('Create an Initiative, then a VotigEvent on it, reads it and then delete it hard', done => {
        const initiativeName = 'The first initiative with a VotingEvent';
        const initiativeAdmin: User = { user: 'The admin of the the first initiative with a VotingEvent' };
        const votingEventName = 'The first VotingEvent on an Initiative';
        let initiative: Initiative;
        let votingEventId: string;

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        // first clean the db
        mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true })
            // then start the test
            .pipe(
                concatMap(() => createInitiative(cachedDb, initiativeName, initiativeAdmin)),
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
                // cancel hard the Initiative
                concatMap(() => cancelInitiative(cachedDb, initiativeName, { hard: true })),
                // now the voting event should not be there
                concatMap(() => readVotingEvent(cachedDb, votingEventId)),
                tap((votingEvent: VotingEvent) => {
                    expect(votingEvent).to.be.undefined;
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

    it('Create an Initiative, then a VotigEvent on it, reads it and then delete it soft', done => {
        const initiativeName = 'The second initiative with a VotingEvent';
        const initiativeAdmin: User = { user: 'The admin of the the second initiative with a VotingEvent' };
        const votingEventName = 'The second VotingEvent on an Initiative';
        let initiative: Initiative;
        let votingEventId: string;

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        // first clean the db
        mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true })
            // then start the test
            .pipe(
                concatMap(() => createInitiative(cachedDb, initiativeName, initiativeAdmin)),
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
                // cancel soft the Initiative
                concatMap(() => cancelInitiative(cachedDb, initiativeName)),
                // now the voting event should not be found but should result cancelled logically
                concatMap(() => readVotingEvent(cachedDb, votingEventId)),
                tap(votingEvent => {
                    expect(votingEvent).to.be.undefined;
                }),
                concatMap(() => readVotingEvents(cachedDb, { all: true })),
                tap(votingEvents => {
                    const vEvent = votingEvents.find(e => e.name === votingEventName);
                    expect(vEvent).to.be.not.undefined;
                }),
                // clean the db
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true }),
                ),
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

describe('3 - administrators', () => {
    it('Create an initiative and add administrators', done => {
        const initiativeName = 'The initiative with some administrators';
        const initiativeAdmin: User = { user: 'The admin of The initiative with some administrators' };
        const administrators: string[] = ['Mary', 'Kathy'];
        let initiative: Initiative;

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        // first clean the db
        mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true })
            // then start the test
            .pipe(
                concatMap(() => createInitiative(cachedDb, initiativeName, initiativeAdmin)),
                concatMap(() => readInitiative(cachedDb, initiativeName)),
                tap(_initiative => (initiative = _initiative)),
                // authenticate as administrator of the Initiative
                concatMap(() => authenticateForTest(cachedDb, initiativeAdmin.user, 'my password')),
                // add the new administrators
                concatMap(headers => addAministrators(initiative, headers)),
                concatMap(() => readInitiative(cachedDb, initiativeName)),
                tap(_initiative => {
                    expect(_initiative.roles.administrators).to.be.not.undefined;
                    // the newly added administrators have to be summed with the administrator set at Initiative creation time
                    expect(_initiative.roles.administrators.length).equal(administrators.length + 1);
                }),
                // authenticate with another administrator, different from the one which was set when the initiative was created
                concatMap(() => authenticateForTest(cachedDb, administrators[0], 'admin0 password')),
                // add again the same administrators
                concatMap(headers => addAministrators(initiative, headers)),
                concatMap(() => readInitiative(cachedDb, initiativeName)),
                tap(_initiative => {
                    expect(_initiative.roles.administrators).to.be.not.undefined;
                    // the number of administrator should remain the same since the administrators just added were already
                    // administrators of this event and therefore are not added any more to the User collection
                    expect(_initiative.roles.administrators.length).equal(administrators.length + 1);
                }),
                // clean the db
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true }),
                ),
            )
            .subscribe(
                null,
                err => {
                    cachedDb.client.close();
                    console.error(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );

        function addAministrators(initiative: Initiative, headers) {
            return mongodbService(
                cachedDb,
                ServiceNames.loadAdministratorsForInitiative,
                {
                    _id: initiative._id,
                    administrators,
                },
                null,
                headers,
            );
        }
    }).timeout(10000);
});
