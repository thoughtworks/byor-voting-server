import { map, tap, mergeMap, last, catchError, concatMap, toArray } from 'rxjs/operators';
import { Collection } from 'mongodb';

import { findObs, updateOneObs, deleteObs } from 'observable-mongo';
import { ERRORS } from './errors';
import { logDebug, logError } from '../lib/utils';
import { validatePasswordAgainstHash$, generateJwt$, verifyJwt, getPasswordHash$ } from '../lib/observables';
import { EmptyError, forkJoin } from 'rxjs';
import { groupBy } from 'lodash';
import { getVotingEvent } from './voting-event-apis';
import { VotingEvent } from '../model/voting-event';

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

export function authenticateForVotingEvent(
    usersColl: Collection<any>,
    votingEventColl: Collection<any>,
    params: { user: string; pwd: string; votingEventId: string; flowStepName: string },
) {
    if (!params.user) throw new Error('Parameter user not passed to authenticateForVotingEvent');
    if (!params.pwd) throw new Error('Parameter pwd not passed to authenticateForVotingEvent');
    if (!params.votingEventId) throw new Error('Parameter votingEventId not passed to authenticateForVotingEvent');
    if (!params.flowStepName) throw new Error('Parameter flowStepName not passed to authenticateForVotingEvent');
    const _user = { user: params.user };
    return findObs(usersColl, _user).pipe(
        toArray(),
        tap(foundUsers => {
            if (foundUsers.length === 0) {
                throw ERRORS.userUnknown;
            }
            if (foundUsers.length > 1) {
                throw new Error(`More than one user with the same user id "${_user}"`);
            }
        }),
        concatMap(([foundUser]) => {
            let votingEvent: VotingEvent;
            return getVotingEvent(votingEventColl, params.votingEventId).pipe(
                tap(votingEvent => {
                    if (!votingEvent) {
                        throw new Error(`No Voting Event found with id "${params.votingEventId}"`);
                    }
                    votingEvent = votingEvent;
                }),
                map(votingEvent => votingEvent.flow),
                map(flow => flow.steps.find(step => step.name === params.flowStepName)),
                tap(step => {
                    if (!step) {
                        throw new Error(
                            `No step with name "${params.flowStepName}" found for Voting Event "${votingEvent.name}"`,
                        );
                    }
                    const rolesAllowedInStep = step.identification.roles;
                    const userRoles = foundUser.roles;
                    const isRoleAllowed = rolesAllowedInStep
                        ? rolesAllowedInStep.some(role => userRoles.includes(role))
                        : true;
                    if (!isRoleAllowed) {
                        throw ERRORS.userWithNotTheRequestedRole;
                    }
                }),
                map(() => foundUser),
            );
        }),
        concatMap(foundUser => {
            return foundUser.pwd
                ? authenticate(usersColl, params).pipe(map(token => ({ token, pwdInserted: false })))
                : // if the pwd is not found as hash in the db, it means that this is the first time the user tries to login
                  // in this case we hash it, store it in the db
                  getPasswordHash$(params.pwd).pipe(
                      tap(hash => (foundUser.pwd = hash)),
                      concatMap(() => updateOneObs({ _id: foundUser._id }, { pwd: foundUser.pwd }, usersColl)),
                      concatMap(() =>
                          authenticate(usersColl, params).pipe(
                              map(token => {
                                  return { token, pwdInserted: true };
                              }),
                          ),
                      ),
                  );
        }),
    );
}

export function addUsersWithRole(usersColl: Collection<any>, params: { users: { user: string; role: string }[] }) {
    const usersGroupedByRoles = groupBy(params.users, 'user');
    const usersWithRoles = Object.keys(usersGroupedByRoles).map(user => {
        const roles = usersGroupedByRoles[user].map(item => item.role);
        return { user, roles };
    });
    return forkJoin(usersWithRoles.map(user => updateOneObs({ user: user.user }, user, usersColl, { upsert: true })));
}

export function deleteUsers(usersColl: Collection<any>, params: { users: string[] }) {
    return forkJoin(params.users.map(user => deleteObs({ user: user }, usersColl)));
}
