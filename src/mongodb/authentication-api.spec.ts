import { expect } from 'chai';

import { switchMap, map, tap, catchError, mergeMap, toArray, concatMap } from 'rxjs/operators';

import { CachedDB, mongodbService } from '../api/service';
import { config } from '../api/config';
import { connectObs, dropObs, insertManyObs, deleteObs } from 'observable-mongo';
import { ServiceNames } from '../service-names';
import { ERRORS } from '../api/errors';
import { of, from, forkJoin } from 'rxjs';
import { getPasswordHash$ } from '../lib/observables';
import { Collection } from 'mongodb';
import { addUsersWithRole } from '../api/authentication-api';

describe('1.0 - Authentication operations', () => {
    it('loads the users collection and then authenticates one valid user', done => {
        const USERS = [{ user: 'abc', pwd: 'cde' }, { user: '123', pwd: '456' }];
        const validCredentials = USERS[0];
        const wrongPwdCredentials = { user: 'abc', pwd: '123' };
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
                        switchMap(collection => laodUsers(collection, users)),
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
export function laodUsers(usersColl: Collection<any>, users: any[]) {
    return dropObs(usersColl).pipe(switchMap(() => insertManyObs(users, usersColl)));
}

describe('1.1 - Voting Event Authentication operations', () => {
    it('load some users from file with no pwd specified and then authenticate some of them', done => {
        const VOTING_EVENT_USERS = [
            { user: 'Mary', role: 'architect' },
            { user: 'Mary', role: 'admin' },
            { user: 'John', role: 'architect' },
        ];

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        let _client;
        let _userColl;
        const votingEventName = 'event to test login of users';
        let votingEventId: string;

        const firstTimePwd = 'I am the password used for the first login';
        let errorMissingRoleEncountered = false;
        let errorWrongPwdEncountered = false;
        let errorUserUnknownEncountered = false;

        connectObs(config.mongoUri)
            // clean the test data
            .pipe(
                tap(client => {
                    _client = client;
                    _userColl = client.db(config.dbname).collection(config.usersCollection);
                }),
                concatMap(() => forkJoin(VOTING_EVENT_USERS.map(user => deleteObs({ user: user.user }, _userColl)))),
                concatMap(() => addUsersWithRole(_userColl, VOTING_EVENT_USERS)),
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
                concatMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, { name: votingEventName })),
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
                // I do a login requesting a role I do not have
                concatMap(() => {
                    const user = VOTING_EVENT_USERS[0].user;
                    return mongodbService(cachedDb, ServiceNames.authenticateForVotingEvent, {
                        user,
                        pwd: firstTimePwd,
                        role: 'the boss',
                        votingEventId,
                    });
                }),
                catchError(err => {
                    errorMissingRoleEncountered = true;
                    expect(err).to.equal(ERRORS.userWithNotTheReuqestedRole);
                    return of(null);
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
                // I do a login with a no existing user
                concatMap(() => {
                    return mongodbService(cachedDb, ServiceNames.authenticateForVotingEvent, {
                        user: 'I do not exist',
                        pwd: 'pwd',
                        votingEventId,
                    });
                }),
                catchError(err => {
                    errorUserUnknownEncountered = true;
                    expect(err).to.equal(ERRORS.userUnknown);
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
                    cachedDb.client.close();
                    _client.close();
                    done();
                },
            );
    }).timeout(10000);
});
