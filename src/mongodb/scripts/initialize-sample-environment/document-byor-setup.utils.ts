import { expect } from 'chai';

import { tap, concatMap, map } from 'rxjs/operators';
import { User, APPLICATION_ADMIN } from '../../../model/user';

import { config } from '../../../api/config';
import { CachedDB, mongodbService } from '../../../api/service';
import { addAdminUserAndPwd } from '../add-admin-user-and-pwd';
import { Observable } from 'rxjs';
import { ServiceNames } from '../../../service-names';
import { createHeaders } from '../../test.utils';
import { Collection } from 'mongodb';
import { findJustOneUserObs } from '../../../api/authentication-api';
import { getInitiatives } from '../../../api/initiative-api';

export interface ExecutionContext {
    cachedDb: CachedDB;
    authorizationHeaders: {
        authorization: string;
    };
}

export function addBYORAdmin(newAdminUsername: string, newAdminPassword: string) {
    return (context: ExecutionContext) => {
        const userCollection = getUsersCollection(context);
        return addAdminUserAndPwd(newAdminUsername, newAdminPassword, userCollection).pipe(
            concatMap(() => {
                return findUser(userCollection, newAdminUsername);
            }),
            tap(user => {
                expect(user).to.be.not.undefined;
                expect(user.pwd).to.be.not.undefined;
                expect(Array.isArray(user.roles)).to.be.true;
                expect(user.roles.find(r => r === APPLICATION_ADMIN)).to.be.not.undefined;
            }),
        );
    };
}

export function authenticate(user: string, pwd: string) {
    return (context: ExecutionContext) => {
        return mongodbService(context.cachedDb, ServiceNames.authenticateOrSetPwdIfFirstTime, {
            user,
            pwd,
        }).pipe(
            map(data => {
                const headers = createHeaders(data.token);
                context.authorizationHeaders = headers;
                return headers;
            }),
            tap(headers => {
                expect(headers).to.be.not.undefined;
                expect(headers.authorization).to.be.not.undefined;
            }),
        );
    };
}

export function cancelInitiative(initiativeName: string, removeFromDb?: boolean) {
    let params = { name: initiativeName };
    const options = removeFromDb ? { hard: removeFromDb } : null;
    if (options) {
        params = { ...params, ...options };
    }
    return (context: ExecutionContext) => {
        return mongodbService(
            context.cachedDb,
            ServiceNames.cancelInitiative,
            params,
            null,
            context.authorizationHeaders,
        ).pipe(
            concatMap(() => {
                const initiativeCollection = getInitiativesCollection(context);
                return getInitiatives(initiativeCollection);
            }),
            tap(inititives => {
                expect(inititives).to.be.not.undefined;
                expect(inititives.length).equal(0);
            }),
        );
    };
}

// export function createInitiative(initiativeName: string) {
//     let params = { name: initiativeName };
//     const options = removeFromDb ? { hard: removeFromDb } : null;
//     if (options) {
//         params = { ...params, ...options };
//     }
//     return (context: ExecutionContext) => {
//         return mongodbService(
//             context.cachedDb,
//             ServiceNames.cancelInitiative,
//             params,
//             null,
//             context.authorizationHeaders,
//         ).pipe(
//             concatMap(() => {
//                 const initiativeCollection = getInitiativesCollection(context);
//                 return getInitiatives(initiativeCollection);
//             }),
//             tap(inititives => {
//                 expect(inititives).to.be.not.undefined;
//                 expect(inititives.length).equal(0);
//             }),
//         );
//     };
// }

function findUser(userCollection: Collection, userName: string): Observable<User> {
    return findJustOneUserObs(userCollection, userName);
}
function getUsersCollection(context: ExecutionContext) {
    return context.cachedDb.db.collection(config.usersCollection);
}
function getInitiativesCollection(context: ExecutionContext) {
    return context.cachedDb.db.collection(config.initiativeCollection);
}
