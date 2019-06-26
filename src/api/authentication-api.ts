import { map, tap, mergeMap, last, catchError } from 'rxjs/operators';
import { Collection } from 'mongodb';

import { findObs } from 'observable-mongo';
import { ERRORS } from './errors';
import { logDebug, logError } from '../lib/utils';
import { validatePasswordAgainstHash$, generateJwt$, verifyJwt } from '../lib/observables';
import { EmptyError } from 'rxjs';

export function authenticate(usersColl: Collection<any>, credentials: { user: string; pwd: string }) {
    const _user = { user: credentials.user };
    return findObs(usersColl, _user).pipe(
        tap(foundUser => logDebug('authenticating user:' + foundUser.user)),
        mergeMap(foundUser =>
            validatePasswordAgainstHash$(credentials.pwd, foundUser.pwd).pipe(
                map(isValid => ({ foundUser: foundUser, isValid: isValid })),
            ),
        ),
        tap((result: { foundUser; isValid }) => {
            if (!result.isValid) throw ERRORS.pwdInvalid;
        }),
        mergeMap(result =>
            generateJwt$({
                user: result.foundUser.user,
                roles: result.foundUser.roles,
            }),
        ),
        last(),
        catchError(err => {
            if (err instanceof EmptyError) throw ERRORS.userUnknown;
            throw err;
        }),
    );
}

export function validateRequestAuthentication(headers: any) {
    let token = headers['authorization'];
    if (token && token.startsWith('Bearer ')) {
        token = token.slice(7, token.length);
    } else {
        throw Error('Auth token is not supplied');
    }
    if (token) {
        try {
            return verifyJwt(token);
        } catch (error) {
            logError('validating auth token failed with error:' + error);
            throw Error('Token is not valid');
        }
    }
}
