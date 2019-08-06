import { Collection } from 'mongodb';
import { toArray, map, tap, concatMap, catchError } from 'rxjs/operators';
import { Observable, forkJoin, throwError } from 'rxjs';

import { insertOneObs, findObs, deleteObs, updateManyObs, updateOneObs } from 'observable-mongo';

import { Initiative } from '../model/initiative';
import { getObjectId } from './utils';
import { cancelVotingEvent, undoCancelVotingEvent } from './voting-event-apis';
import { VotingEvent } from '../model/voting-event';
import { User, APPLICATION_ADMIN } from '../model/user';
import { ERRORS } from './errors';
import { addUsers, findJustOneUserObs } from './authentication-api';

export function createInitiative(
    initiativeCollection: Collection,
    usersCollection: Collection,
    params: { name: string; administrator: User },
    user: string,
) {
    if (!params.name) {
        throw new Error(`parameter name has not been passed and is required`);
    }
    const adminId = params.administrator ? params.administrator.user : user;
    const newInitiative: Initiative = {
        name: params.name,
        creationTS: new Date(Date.now()).toISOString(),
        roles: { administrators: [adminId] },
    };
    const insertInitiativeOperation = insertOneObs(newInitiative, initiativeCollection);
    const insertInitiativeAndUserOperation = params.administrator
        ? addUsers(usersCollection, { users: [params.administrator] }).pipe(concatMap(() => insertInitiativeOperation))
        : insertInitiativeOperation;
    return verifyPermissionToManageInitiatives(usersCollection, user, newInitiative.name, 'CREATE INITIATIVE').pipe(
        concatMap(() => insertInitiativeAndUserOperation),
        catchError(err => {
            if (err.code === ERRORS.votingEventAlreadyPresent.mongoErrorCode) {
                const errInitiativePresent = { ...ERRORS.initiativeAlreadyPresent };
                errInitiativePresent.message = `Initiative "${newInitiative.name}" already present`;
                return throwError(errInitiativePresent);
            } else {
                return throwError(err);
            }
        }),
    );
}
function verifyPermissionToManageInitiatives(
    usersCollection: Collection,
    user: string,
    initiativeName: string,
    operationName: string,
) {
    return findJustOneUserObs(usersCollection, user).pipe(
        catchError(err => {
            if (err.errorCode === ERRORS.userUnknown.errorCode) {
                const _err = { ...ERRORS.noUserProvidedForAuthorization };
                _err.message = `No user provided to authorize operation ${operationName} on initiative ${initiativeName}`;
                throw err;
            }
            throw err;
        }),
        tap(user => {
            const isAdmin = user.roles && user.roles.some(r => r === APPLICATION_ADMIN);
            if (!isAdmin) {
                const err = { ...ERRORS.userWithNotTheRequestedRole };
                err.message = `The user "${
                    user.user
                }" does not have the required permission to authorize operation ${operationName} on the initiative "${initiativeName}"`;
                throw err;
            }
        }),
    );
}

export function getInitiatives(initiativeCollection: Collection, params?: { all?: boolean }) {
    const selector = params && params.all ? {} : { $or: [{ cancelled: { $exists: false } }, { cancelled: false }] };
    return findObs(initiativeCollection, selector).pipe(
        toArray(),
        map((initiatives: Initiative[]) => initiatives.sort()),
    );
}
export function getInititive(initiativeCollection: Collection, params: { name: string }) {
    const selector = { name: params.name, $or: [{ cancelled: { $exists: false } }, { cancelled: false }] };
    return findObs(initiativeCollection, selector).pipe(
        toArray(),
        map((initiatives: Initiative[]) => initiatives[0]),
    );
}

export function cancelInitiative(
    initiativeCollection: Collection,
    votingEventsCollection: Collection,
    votesCollection: Collection,
    usersCollection: Collection,
    params: { name?: string; _id?: any; hard?: boolean },
    user: string,
) {
    let retObs: Observable<any>;
    const initiativeKey = !!params._id ? { _id: getObjectId(params._id) } : { name: params.name };
    const votingEventKey = !!params._id ? { initiativeId: params._id } : { initiativeName: params.name };
    if (params.hard) {
        retObs = findObs(votingEventsCollection, votingEventKey).pipe(
            map((votingEvent: VotingEvent) =>
                cancelVotingEvent(votingEventsCollection, votesCollection, { _id: votingEvent._id, hard: true }),
            ),
            toArray(),
            map(operations => [...operations, deleteObs(initiativeKey, initiativeCollection)]),
            concatMap(operations => forkJoin(operations)),
        );
    } else {
        retObs = findObs(votingEventsCollection, votingEventKey).pipe(
            map((votingEvent: VotingEvent) =>
                cancelVotingEvent(votingEventsCollection, votesCollection, { _id: votingEvent._id, hard: false }),
            ),
            toArray(),
            map(operations => [...operations, updateManyObs(initiativeKey, { cancelled: true }, initiativeCollection)]),
            concatMap(operations => forkJoin(operations)),
        );
    }
    return verifyPermissionToManageInitiatives(
        usersCollection,
        user,
        params.name || params._id,
        'CANCEL INITIATIVE',
    ).pipe(concatMap(() => retObs));
}
export function undoCancelInitiative(
    initiativeCollection: Collection,
    votingEventsCollection: Collection,
    votesCollection: Collection,
    usersCollection: Collection,
    params: { name?: string; _id?: any },
    user: string,
) {
    const initiativeKey = !!params._id ? { _id: getObjectId(params._id) } : { name: params.name };
    const votingEventKey = !!params._id ? { initiativeId: params._id } : { initiativeName: params.name };
    const operation = findObs(votingEventsCollection, votingEventKey).pipe(
        // for each VotingEvent create and Observable that represents the operation to undo cancel it
        map((votingEvent: VotingEvent) =>
            undoCancelVotingEvent(votingEventsCollection, votesCollection, { _id: votingEvent._id }),
        ),
        toArray(),
        // add to the array of cancel operations also the operation to undo cancel the initiative
        tap((undoOperations: Observable<any>[]) => {
            return undoOperations.push(updateManyObs(initiativeKey, { cancelled: false }, initiativeCollection));
        }),
        // return the observable which executes all the operations in parallel
        concatMap(undoOperations => forkJoin(undoOperations)),
    );
    return verifyPermissionToManageInitiatives(
        usersCollection,
        user,
        params.name || params._id,
        'UNDO CANCEL INITIATIVE',
    ).pipe(concatMap(() => operation));
}

export function loadAdministratorsForInitiative(
    initiativeCollection: Collection,
    usersCollection: Collection,
    params: { _id: string; administrators: string[] },
    user: string,
) {
    if (!params._id) {
        throw new Error(`_id is required to identify the Initiative`);
    }
    if (!user) {
        throw new Error(`User must be passed when invoking loadAdministratorsForInitiative`);
    }

    const initiativeKey = { _id: getObjectId(params._id) };

    // fimd the Inititative
    return findObs(initiativeCollection, initiativeKey).pipe(
        toArray(),
        // then check if the Inititative exists
        tap((initiatives: Initiative[]) => {
            if (initiatives.length === 0) {
                throw new Error(`Initiative not found for id ${params._id}`);
            }
        }),
        map(initiatives => initiatives[0]),
        tap(initiative => verifyPermissionTaAddAdministrator(user, initiative)),
        concatMap(() => {
            const users = params.administrators.map(a => ({ user: a }));
            return addUsers(usersCollection, { users });
        }),
        concatMap(() => {
            const dataToUpdate = {
                $addToSet: { 'roles.administrators': { $each: params.administrators } },
            };
            return updateOneObs(initiativeKey, dataToUpdate, initiativeCollection);
        }),
    );
}

function verifyPermissionTaAddAdministrator(user: string, initiative: Initiative) {
    const isAdmin = initiative.roles.administrators.some(a => a === user);
    if (!isAdmin) {
        const err = { ...ERRORS.userWithNotTheRequestedRole };
        err.message = `${user} does not have the required permission to add administators to Initiative ${
            initiative.name
        }`;
        throw err;
    }
}
