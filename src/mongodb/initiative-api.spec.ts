import { expect } from 'chai';

import { CachedDB, mongodbService } from '../api/service';
import { config } from '../api/config';
import { ServiceNames } from '../service-names';
import { concatMap, tap, map } from 'rxjs/operators';
import { logError } from '../lib/utils';
import { Initiative } from '../model/initiative';
import { VotingEvent } from '../model/voting-event';
import { User } from '../model/user';
import {
    authenticateForTest,
    createVotingEventForTest,
    cancelInitiative,
    readInitiative,
    readVotingEvent,
    readVotingEvents,
    cancelAndCreateInitiative,
    undoCancelInitiative,
    deleteUsers,
    authenticateAsAdminForTest,
} from './test.utils';
import { addUsers } from '../api/authentication-api';
import { ERRORS } from '../api/errors';

describe('1 - create read and delete initiatives', () => {
    it('Create an initiative, reads it and then delete it hard', done => {
        const initiativeName = 'The first initiative';
        const initiativeAdmin: User = { user: 'The admin of the first initiative' };

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        let headers: {
            authorization: string;
        };

        // first clean the db
        cancelAndCreateInitiative(cachedDb, initiativeName, initiativeAdmin, true)
            // then start the test
            .pipe(
                tap(_headers => (headers = _headers)),
                concatMap(() => readInitiative(cachedDb, initiativeName)),
                tap((initiative: Initiative) => {
                    expect(initiative).to.be.not.undefined;
                    expect(initiative.name).equal(initiativeName);
                }),
                concatMap(() => cancelInitiative(cachedDb, initiativeName, headers, { hard: true })),
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
        let headers: {
            authorization: string;
        };

        // first clean the db
        cancelAndCreateInitiative(cachedDb, initiativeName, initiativeAdmin, true)
            // then start the test
            .pipe(
                tap(_headers => (headers = _headers)),
                concatMap(() => readInitiative(cachedDb, initiativeName)),
                tap((initiative: Initiative) => {
                    expect(initiative).to.be.not.undefined;
                    expect(initiative.name).equal(initiativeName);
                }),
                concatMap(() => cancelInitiative(cachedDb, initiativeName, headers)),
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
                concatMap(() => cancelInitiative(cachedDb, initiativeName, headers, { hard: true })),
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

    it('Create an initiative, reads it, delete it soft and then undo the cancellation', done => {
        const initiativeName = 'The second initiative';
        const initiativeAdmin: User = { user: 'The admin of the second initiative' };

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        let headers: {
            authorization: string;
        };

        // first clean the db
        cancelAndCreateInitiative(cachedDb, initiativeName, initiativeAdmin, true)
            // then start the test
            .pipe(
                tap(_headers => (headers = _headers)),
                concatMap(() => readInitiative(cachedDb, initiativeName)),
                tap((initiative: Initiative) => {
                    expect(initiative).to.be.not.undefined;
                    expect(initiative.name).equal(initiativeName);
                }),
                concatMap(() => cancelInitiative(cachedDb, initiativeName, headers)),
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
                // undo the cancel operation
                concatMap(() => undoCancelInitiative(cachedDb, initiativeName, headers)),
                // now the initiative can be read again
                concatMap(() => readInitiative(cachedDb, initiativeName)),
                tap((initiative: Initiative) => {
                    expect(initiative).to.be.not.undefined;
                    expect(initiative.name).equal(initiativeName);
                }),
                // clean the db
                concatMap(() => cancelInitiative(cachedDb, initiativeName, headers, { hard: true })),
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
        let headers: {
            authorization: string;
        };

        // first clean the db
        cancelAndCreateInitiative(cachedDb, initiativeName, initiativeAdmin, true)
            // then start the test
            .pipe(
                tap(_headers => (headers = _headers)),
                concatMap(() => readInitiative(cachedDb, initiativeName)),
                tap(_initiative => (initiative = _initiative)),
                concatMap(() => authenticateForTest(cachedDb, initiativeAdmin.user, 'my password')),
                concatMap(_headers =>
                    createVotingEventForTest(cachedDb, votingEventName, _headers, initiativeName, initiative._id),
                ),
                tap(_id => (votingEventId = _id.toHexString())),
                concatMap(() => readVotingEvent(cachedDb, votingEventId)),
                tap(votingEvent => {
                    expect(votingEvent).to.be.not.undefined;
                    expect(votingEvent.name).equal(votingEventName);
                }),
                // cancel hard the Initiative
                concatMap(() => cancelInitiative(cachedDb, initiativeName, headers, { hard: true })),
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
        let headers: {
            authorization: string;
        };

        // first clean the db
        cancelAndCreateInitiative(cachedDb, initiativeName, initiativeAdmin, true)
            // then start the test
            .pipe(
                tap(_headers => (headers = _headers)),
                concatMap(() => readInitiative(cachedDb, initiativeName)),
                tap(_initiative => (initiative = _initiative)),
                concatMap(() => authenticateForTest(cachedDb, initiativeAdmin.user, 'my password')),
                concatMap(_headers =>
                    createVotingEventForTest(cachedDb, votingEventName, _headers, initiativeName, initiative._id),
                ),
                tap(_id => (votingEventId = _id.toHexString())),
                concatMap(() => readVotingEvent(cachedDb, votingEventId)),
                tap(votingEvent => {
                    expect(votingEvent).to.be.not.undefined;
                    expect(votingEvent.name).equal(votingEventName);
                }),
                // cancel soft the Initiative
                concatMap(() => cancelInitiative(cachedDb, initiativeName, headers)),
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
                concatMap(() => cancelInitiative(cachedDb, initiativeName, headers, { hard: true })),
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
        let headers: {
            authorization: string;
        };

        // first clean the db
        cancelAndCreateInitiative(cachedDb, initiativeName, initiativeAdmin, true)
            // then start the test
            .pipe(
                tap(_headers => (headers = _headers)),
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
                concatMap(() => cancelInitiative(cachedDb, initiativeName, headers, { hard: true })),
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

describe('4 - authorization', () => {
    it('Tries to create an initiative without having the required authorizations', done => {
        const initiativeName = 'The initiative that can not be created because of lack of authorization';
        const initiativeCreatorWannaBe = { user: 'The Initiative creator wanna-be' };
        const creatorWannaBePwd = 'The wanna be pwd';

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        let headers;

        // first add the wanna-be creator as User of the appicaton
        authenticateAsAdminForTest(cachedDb)
            // then start the test
            .pipe(
                tap(_headers => (headers = _headers)),
                concatMap(() => deleteUsers(cachedDb, [initiativeCreatorWannaBe.user]).pipe(map(() => headers))),
                concatMap(() => {
                    return addUsers(cachedDb.db.collection(config.usersCollection), {
                        users: [initiativeCreatorWannaBe],
                    });
                }),
                concatMap(() => {
                    return cancelInitiative(cachedDb, initiativeName, headers, { hard: true });
                }),
                // now we authenticate as the creater wannabe
                concatMap(() => authenticateForTest(cachedDb, initiativeCreatorWannaBe.user, creatorWannaBePwd)),
                concatMap(wannaBeHeaders => {
                    return mongodbService(
                        cachedDb,
                        ServiceNames.createInitiative,
                        {
                            name: initiativeName,
                            administrator: initiativeCreatorWannaBe,
                        },
                        null,
                        wannaBeHeaders,
                    );
                }),
            )
            .subscribe(
                () => {
                    const error = '4 - authorization - It should not pass from here since an error should be generated';
                    console.error(error);
                },
                err => {
                    cachedDb.client.close();
                    expect(err.errorCode).equal(ERRORS.userWithNotTheRequestedRole.errorCode);
                    done();
                },
                () => {
                    const error = '4 - authorization - It should have not completed since an error should be generated';
                    cachedDb.client.close();
                    done(error);
                },
            );
    }).timeout(10000);
});
