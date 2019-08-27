import { expect } from 'chai';

import { switchMap, map, tap, catchError, mergeMap, toArray, concatMap } from 'rxjs/operators';

import { CachedDB, mongodbService } from '../api/service';
import { config } from '../api/config';
import { connectObs, insertManyObs, deleteObs } from 'observable-mongo';
import { ServiceNames } from '../service-names';
import { ERRORS } from '../api/errors';
import { of, from, forkJoin } from 'rxjs';
import { getPasswordHash$ } from '../lib/observables';
import { Collection } from 'mongodb';
import { VotingEventFlow } from '../model/voting-event-flow';
import { addUsersWithGroup, findJustOneUserObs } from '../api/authentication-api';
import { createVotingEventForVotingEventTest, cancelVotingEvent } from './test.utils';
import { User } from '../model/user';

describe('1.0 - Authentication operations', () => {
    it('loads the users collection and then authenticates one valid user', done => {
        const USERS: User[] = [{ user: 'litte', pwd: '123' }, { user: '123', pwd: '456' }];
        const validCredentials = USERS[0];
        const wrongPwdCredentials = { user: 'litte', pwd: 'xyz' };
        const notExistingUserCredentials = { user: '321', pwd: '123' };

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        let _client;
        from(USERS)
            .pipe(
                mergeMap(user => getPasswordHash$(user.pwd).pipe(map(hash => ({ ...user, pwd: hash })))),
                toArray(),
                mergeMap(users =>
                    connectObs(config.mongoUri).pipe(
                        map(client => {
                            _client = client;
                            return client.db(config.dbname).collection(config.usersCollection);
                        }),
                        switchMap(collection => loadUsers(collection, users)),
                        switchMap(() => mongodbService(cachedDb, ServiceNames.authenticate, validCredentials)),
                        tap(resp => {
                            expect(resp).to.be.string;
                        }),
                        switchMap(() => mongodbService(cachedDb, ServiceNames.authenticate, wrongPwdCredentials)),
                        catchError(err => {
                            expect(err.errorCode).to.equal(ERRORS.pwdInvalid.errorCode);
                            return of(null);
                        }),
                        switchMap(() =>
                            mongodbService(cachedDb, ServiceNames.authenticate, notExistingUserCredentials),
                        ),
                        catchError(err => {
                            expect(err.errorCode).to.equal(ERRORS.userUnknown.errorCode);
                            return of(null);
                        }),
                    ),
                ),
            )
            .subscribe(
                null,
                err => {
                    cachedDb.client.close();
                    _client.close();
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    _client.close();
                    done();
                },
            );
    }).timeout(10000);
});

// If used only for test, then does not need test
export function loadUsers(usersColl: Collection<any>, users: User[]) {
    const usersNames = users.map(u => u.user);
    return deleteObs({ user: { $in: usersNames } }, usersColl).pipe(switchMap(() => insertManyObs(users, usersColl)));
}

describe('1.1 - Voting Event Authentication operations', () => {
    const VOTING_EVENT_USERS = [
        { user: 'Mary', group: 'architect' },
        { user: 'Mary', group: 'dev' },
        { user: 'John', group: 'dev' },
    ];

    const votingEventFlow: VotingEventFlow = {
        name: 'Voting Event Flow',
        steps: [
            {
                name: 'aStep',
                identification: { name: 'login', groups: ['architect'] },
                action: { name: 'conversation' },
            },
        ],
    };

    it('an user logs in for the first time and then logs in again', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const votingEventName = 'event to test login of users';

        let votingEventId: string;
        let client;

        const firstTimePwd = 'I am the password used for the first login';

        cleanTestDataForAuthenticationTests(cachedDb, votingEventName)
            // run the real test logic
            .pipe(
                tap(({ _votingEventId, _client }) => {
                    votingEventId = _votingEventId;
                    client = _client;
                }),
                // I do the first login - no password yet set
                concatMap(() => {
                    const user = VOTING_EVENT_USERS[0].user;
                    return mongodbService(cachedDb, ServiceNames.authenticateForVotingEvent, {
                        user,
                        pwd: firstTimePwd,
                        votingEventId,
                    });
                }),
                tap(({ token, pwdInserted }) => {
                    expect(token).to.be.not.undefined;
                    expect(pwdInserted).to.be.true;
                }),
                // I do a second login - the password has been already set and enchripted
                concatMap(() => {
                    const user = VOTING_EVENT_USERS[0].user;
                    return mongodbService(cachedDb, ServiceNames.authenticateForVotingEvent, {
                        user,
                        pwd: firstTimePwd,
                        votingEventId,
                    });
                }),
                tap(({ token, pwdInserted }) => {
                    expect(token).to.be.not.undefined;
                    expect(pwdInserted).to.be.false;
                }),
            )
            .subscribe(
                () => {},
                err => {
                    console.error(err);
                    cachedDb.client.close();
                    client.close();
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('an user which does not belong to one of the groups required by the voting event flow step tries to log in', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const votingEventName = 'event to test login of user without required group';

        let votingEventId: string;
        let client;

        const firstTimePwd = 'I am the password used for the first login';

        let errorMissingRoleEncountered = false;

        cleanTestDataForAuthenticationTests(cachedDb, votingEventName)
            // run the real test logic
            .pipe(
                tap(({ _votingEventId, _client }) => {
                    votingEventId = _votingEventId;
                    client = _client;
                }),
                // I do a login requesting a role I do not have
                concatMap(() => {
                    const user = VOTING_EVENT_USERS[2].user;
                    return mongodbService(cachedDb, ServiceNames.authenticateForVotingEvent, {
                        user,
                        pwd: firstTimePwd,
                        votingEventId,
                    });
                }),
                catchError(err => {
                    errorMissingRoleEncountered = true;
                    expect(err).to.equal(ERRORS.userWithNotTheRequestedRole);
                    return of(null);
                }),
            )
            .subscribe(
                () => {},
                err => {
                    console.error(err);
                    cachedDb.client.close();
                    client.close();
                    done(err);
                },
                () => {
                    expect(errorMissingRoleEncountered).to.be.true;
                    cachedDb.client.close();
                    client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('an user tries to log in with the wrong password', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const votingEventName = 'event to test login of users with the wrong pwd';

        let votingEventId: string;
        let client;

        const firstTimePwd = 'I am the password used for the first login';
        let errorWrongPwdEncountered = false;

        cleanTestDataForAuthenticationTests(cachedDb, votingEventName)
            // run the real test logic
            .pipe(
                tap(({ _votingEventId, _client }) => {
                    votingEventId = _votingEventId;
                    client = _client;
                }),
                // I do the first login and doing so I set my password
                concatMap(() => {
                    const user = VOTING_EVENT_USERS[0].user;
                    return mongodbService(cachedDb, ServiceNames.authenticateForVotingEvent, {
                        user,
                        pwd: firstTimePwd,
                        votingEventId,
                    });
                }),
                // I do a login with a wrong pwd
                concatMap(() => {
                    const user = VOTING_EVENT_USERS[0].user;
                    return mongodbService(cachedDb, ServiceNames.authenticateForVotingEvent, {
                        user,
                        pwd: 'wrong pwd',
                        votingEventId,
                    });
                }),
                catchError(err => {
                    errorWrongPwdEncountered = true;
                    expect(err).to.equal(ERRORS.pwdInvalid);
                    return of(null);
                }),
            )
            .subscribe(
                () => {},
                err => {
                    console.error(err);
                    cachedDb.client.close();
                    client.close();
                    done(err);
                },
                () => {
                    expect(errorWrongPwdEncountered).to.be.true;
                    cachedDb.client.close();
                    client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('an user which is unknown tries to log in', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const votingEventName = 'event to test login of an user unknown';

        let votingEventId: string;
        let client;

        let errorUserUnknownEncountered = false;

        cleanTestDataForAuthenticationTests(cachedDb, votingEventName)
            // run the real test logic
            .pipe(
                tap(({ _votingEventId, _client }) => {
                    votingEventId = _votingEventId;
                    client = _client;
                }),
                // I do a login with a non existing user
                concatMap(() => {
                    return mongodbService(cachedDb, ServiceNames.authenticateForVotingEvent, {
                        user: 'I do not exist',
                        pwd: 'pwd',
                        votingEventId,
                    });
                }),
                catchError(err => {
                    errorUserUnknownEncountered = true;
                    expect(err.errorCode).to.equal(ERRORS.userUnknown.errorCode);
                    return of(err);
                }),
            )
            .subscribe(
                () => {},
                err => {
                    console.error(err);
                    cachedDb.client.close();
                    client.close();
                    done(err);
                },
                () => {
                    expect(errorUserUnknownEncountered).to.be.true;
                    cachedDb.client.close();
                    client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('an user which has been deleted tries to log in', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        const votingEventName = 'event to test login of an user which has been previously deleted';

        let votingEventId: string;
        let client;

        const firstTimePwd = 'I am the password used for the first login';
        let errorUserUnknownBecauseDeletedEncountered = false;

        cleanTestDataForAuthenticationTests(cachedDb, votingEventName)
            // run the real test logic
            .pipe(
                tap(({ _votingEventId, _client }) => {
                    votingEventId = _votingEventId;
                    client = _client;
                }),
                // I delete a user and then try to log in with its credentials
                concatMap(() => {
                    return mongodbService(cachedDb, ServiceNames.deleteUsers, { users: [VOTING_EVENT_USERS[0].user] });
                }),
                concatMap(() => {
                    const user = VOTING_EVENT_USERS[0].user;
                    return mongodbService(cachedDb, ServiceNames.authenticateForVotingEvent, {
                        user,
                        pwd: firstTimePwd,
                        votingEventId,
                    });
                }),
                catchError(err => {
                    errorUserUnknownBecauseDeletedEncountered = true;
                    expect(err.errorCode).to.equal(ERRORS.userUnknown.errorCode);
                    return of(err);
                }),
            )
            .subscribe(
                () => {},
                err => {
                    console.error(err);
                    cachedDb.client.close();
                    client.close();
                    done(err);
                },
                () => {
                    expect(errorUserUnknownBecauseDeletedEncountered).to.be.true;
                    cachedDb.client.close();
                    client.close();
                    done();
                },
            );
    }).timeout(10000);

    function cleanTestDataForAuthenticationTests(cachedDb, votingEventName) {
        let _client;
        let _userColl;
        return (
            connectObs(config.mongoUri)
                // clean the test data
                .pipe(
                    tap(client => {
                        _client = client;
                        _userColl = client.db(config.dbname).collection(config.usersCollection);
                    }),
                    concatMap(() =>
                        forkJoin(VOTING_EVENT_USERS.map(user => deleteObs({ user: user.user }, _userColl))),
                    ),
                    concatMap(() => {
                        return addUsersWithGroup(_client.db(config.dbname).collection(config.usersCollection), {
                            users: VOTING_EVENT_USERS,
                        });
                    }),
                    concatMap(() =>
                        mongodbService(cachedDb, ServiceNames.getVotingEvents).pipe(
                            map(votingEvents => votingEvents.filter(ve => ve.name === votingEventName)),
                            concatMap(votingEvents => {
                                const votingEventsDeleteObs = votingEvents.map(ve =>
                                    cancelVotingEvent(cachedDb, ve._id, true),
                                );
                                return votingEvents.length > 0 ? forkJoin(votingEventsDeleteObs) : of(null);
                            }),
                        ),
                    ),
                    concatMap(() => createVotingEventForVotingEventTest(cachedDb, votingEventName, votingEventFlow)),
                    map(id => ({ _votingEventId: id.toHexString(), _client })),
                )
        );
    }
});

describe('2.1 - Load users', () => {
    it('load some users from file and check that the Groups are correct', done => {
        const tina = 'Tina@my.com';
        const donald = 'Donald@my.com';
        const VOTING_EVENT_USERS = [
            { user: tina, group: 'architect' },
            { user: tina, group: 'dev' },
            { user: donald, group: 'dev' },
        ];

        let _client;
        let _userColl;

        connectObs(config.mongoUri)
            // clean the test data
            .pipe(
                tap(client => {
                    _client = client;
                    _userColl = client.db(config.dbname).collection(config.usersCollection);
                }),
                concatMap(() => forkJoin(VOTING_EVENT_USERS.map(user => deleteObs({ user: user.user }, _userColl)))),
            )
            // run the real test logic
            .pipe(
                concatMap(() => {
                    return addUsersWithGroup(_userColl, {
                        users: VOTING_EVENT_USERS,
                    });
                }),
                concatMap(() => findJustOneUserObs(_userColl, tina)),
                tap(user => {
                    expect(user.groups.length).equal(2);
                }),
                concatMap(() => findJustOneUserObs(_userColl, donald)),
                tap(user => {
                    expect(user.groups.length).equal(1);
                }),
            )
            .subscribe(
                null,
                err => {
                    _client.close();
                    done(err);
                },
                () => {
                    _client.close();
                    done();
                },
            );
    }).timeout(10000);
});
