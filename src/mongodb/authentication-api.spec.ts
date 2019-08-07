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
import { createVotingEventForVotingEventTest } from './test.utils';
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
    it('load some users from file with no pwd specified and then authenticate some of them', done => {
        const VOTING_EVENT_USERS = [
            { user: 'Mary', group: 'architect' },
            { user: 'Mary', group: 'dev' },
            { user: 'John', group: 'dev' },
        ];

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        let _client;
        let _userColl;
        const votingEventName = 'event to test login of users';
        const firstStepName = 'first step';
        const secondStepName = 'second step';
        const votingEventFlow: VotingEventFlow = {
            steps: [
                {
                    name: firstStepName,
                    identification: { name: 'nickname' },
                    action: { name: 'vote', parameters: { commentOnVoteBlocked: false } },
                },
                {
                    name: secondStepName,
                    identification: { name: 'login', groups: ['architect'] },
                    action: { name: 'conversation' },
                },
            ],
        };
        let votingEventId: string;

        const firstTimePwd = 'I am the password used for the first login';
        let errorMissingRoleEncountered = false;
        let errorWrongPwdEncountered = false;
        let errorUserUnknownEncountered = false;
        let errorUserUnknownBecauseDeletedEncountered = false;

        connectObs(config.mongoUri)
            // clean the test data
            .pipe(
                tap(client => {
                    _client = client;
                    _userColl = client.db(config.dbname).collection(config.usersCollection);
                }),
                concatMap(() => forkJoin(VOTING_EVENT_USERS.map(user => deleteObs({ user: user.user }, _userColl)))),
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
                                mongodbService(cachedDb, ServiceNames.cancelVotingEvent, { _id: ve._id, hard: true }),
                            );
                            return votingEvents.length > 0 ? forkJoin(votingEventsDeleteObs) : of(null);
                        }),
                    ),
                ),
                concatMap(() => createVotingEventForVotingEventTest(cachedDb, votingEventName, votingEventFlow)),
                tap(id => (votingEventId = id.toHexString())),
            )
            // run the real test logic
            .pipe(
                // I do the first login - no password yet set
                concatMap(() => {
                    const user = VOTING_EVENT_USERS[0].user;
                    return mongodbService(cachedDb, ServiceNames.authenticateForVotingEvent, {
                        user,
                        pwd: firstTimePwd,
                        votingEventId,
                        flowStepName: secondStepName,
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
                        flowStepName: secondStepName,
                    });
                }),
                tap(({ token, pwdInserted }) => {
                    expect(token).to.be.not.undefined;
                    expect(pwdInserted).to.be.false;
                }),
                // I do a login requesting a role I do not have
                concatMap(() => {
                    const user = VOTING_EVENT_USERS[2].user;
                    return mongodbService(cachedDb, ServiceNames.authenticateForVotingEvent, {
                        user,
                        pwd: firstTimePwd,
                        votingEventId,
                        flowStepName: secondStepName,
                    });
                }),
                catchError(err => {
                    errorMissingRoleEncountered = true;
                    expect(err).to.equal(ERRORS.userWithNotTheRequestedRole);
                    return of(null);
                }),
                // I do a login with a wrong pwd
                concatMap(() => {
                    const user = VOTING_EVENT_USERS[0].user;
                    return mongodbService(cachedDb, ServiceNames.authenticateForVotingEvent, {
                        user,
                        pwd: 'wrong pwd',
                        votingEventId,
                        flowStepName: secondStepName,
                    });
                }),
                catchError(err => {
                    errorWrongPwdEncountered = true;
                    expect(err).to.equal(ERRORS.pwdInvalid);
                    return of(null);
                }),
                // I do a login with a no existing user
                concatMap(() => {
                    return mongodbService(cachedDb, ServiceNames.authenticateForVotingEvent, {
                        user: 'I do not exist',
                        pwd: 'pwd',
                        votingEventId,
                        flowStepName: secondStepName,
                    });
                }),
                catchError(err => {
                    errorUserUnknownEncountered = true;
                    expect(err.errorCode).to.equal(ERRORS.userUnknown.errorCode);
                    return of(err);
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
                        flowStepName: secondStepName,
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
                    _client.close();
                    done(err);
                },
                () => {
                    expect(errorMissingRoleEncountered).to.be.true;
                    expect(errorWrongPwdEncountered).to.be.true;
                    expect(errorUserUnknownEncountered).to.be.true;
                    expect(errorUserUnknownBecauseDeletedEncountered).to.be.true;
                    cachedDb.client.close();
                    _client.close();
                    done();
                },
            );
    }).timeout(10000);
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
