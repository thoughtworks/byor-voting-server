import { expect } from 'chai';

import { switchMap, map, tap, catchError, mergeMap, toArray } from 'rxjs/operators';

import { CachedDB, mongodbService } from '../api/service';
import { config } from '../api/config';
import { connectObs, dropObs, insertManyObs } from 'observable-mongo';
import { ServiceNames } from '../service-names';
import { ERRORS } from '../api/errors';
import { of, from } from 'rxjs';
import { getPasswordHash$ } from '../lib/observables';
import { Collection } from 'mongodb';

describe('Authentication operations', () => {
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
