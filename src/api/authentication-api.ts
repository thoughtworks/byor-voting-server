import { map, tap, mergeMap, last, catchError, concatMap, toArray } from 'rxjs/operators';
import { Collection } from 'mongodb';

import { findObs, updateOneObs, deleteObs } from 'observable-mongo';
import { ERRORS } from './errors';
import { logDebug, logError } from '../lib/utils';
import { validatePasswordAgainstHash$, generateJwt$, verifyJwt, getPasswordHash$ } from '../lib/observables';
import { EmptyError, forkJoin } from 'rxjs';
import { getVotingEvent } from './voting-event-apis';
import { VotingEvent } from '../model/voting-event';
import { User } from '../model/user';
import { groupBy } from 'lodash';

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
            const ret = verifyJwt(token);
            return ret;
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
    return findUsersObs(usersColl, params.user).pipe(
        concatMap(foundUser => {
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
                    const groupsAllowedInStep = step.identification.groups;
                    const userGroups = foundUser.groups;
                    const isGroupAllowed = groupsAllowedInStep
                        ? groupsAllowedInStep.some(role => userGroups.includes(role))
                        : true;
                    if (!isGroupAllowed) {
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
                      concatMap(() => updateOneObs({ user: foundUser.user }, { pwd: foundUser.pwd }, usersColl)),
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

export function authenticateOrSetPwdIfFirstTime(usersColl: Collection, params: { user: string; pwd: string }) {
    if (!params.user) throw new Error('Parameter user not passed to authenticateForVotingEvent');
    if (!params.pwd) throw new Error('Parameter pwd not passed to authenticateForVotingEvent');
    return findUsersObs(usersColl, params.user).pipe(
        concatMap(foundUser => {
            return foundUser.pwd
                ? authenticate(usersColl, params).pipe(map(token => ({ token, pwdInserted: false })))
                : // if the pwd is not found as hash in the db, it means that this is the first time the user tries to login
                  // in this case we hash it, store it in the db
                  getPasswordHash$(params.pwd).pipe(
                      tap(hash => (foundUser.pwd = hash)),
                      concatMap(() => updateOneObs({ user: foundUser.user }, { pwd: foundUser.pwd }, usersColl)),
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

function findUsersObs(usersColl: Collection, user: string) {
    return findObs(usersColl, { user }).pipe(
        toArray(),
        tap(foundUsers => {
            if (foundUsers.length === 0) {
                throw ERRORS.userUnknown;
            }
            if (foundUsers.length > 1) {
                throw new Error(`More than one user with the same user id "${user}"`);
            }
        }),
        map((users: User[]) => users[0]),
    );
}

export function deleteUsers(usersColl: Collection<any>, params: { users: string[] }) {
    return forkJoin(params.users.map(user => deleteObs({ user: user }, usersColl)));
}

export function addUsers(
    usersColl: Collection<any>,
    params: {
        users: User[];
    },
) {
    const updateOps = params.users.map(u => updateOneObs({ user: u.user }, u, usersColl, { upsert: true }));
    return forkJoin(updateOps);
}

export function addUsersWithGroup(
    usersColl: Collection<any>,
    params: {
        users: {
            user: string;
            group: string;
        }[];
    },
) {
    const dataGroupedByUser = groupBy(params.users, 'user');
    const usersWithGroups = Object.keys(dataGroupedByUser).map(user => {
        const groups = dataGroupedByUser[user].map(item => item.group);
        return { user, groups };
    });
    return addUsers(usersColl, { users: usersWithGroups });
}
