import { Collection } from 'mongodb';
import { toArray, map, tap, concatMap } from 'rxjs/operators';
import { Observable, forkJoin } from 'rxjs';

import { insertOneObs, findObs, deleteObs, updateManyObs } from 'observable-mongo';

import { Initiative } from '../model/initiative';
import { getObjectId } from './utils';
import { cancelVotingEvent, undoCancelVotingEvent } from './voting-event-apis';
import { VotingEvent } from '../model/voting-event';
import { User, INITIATIVE_ADMINISTRATOR } from '../model/user';
import { ERRORS } from './errors';

export function createInitiative(
    initiativeCollection: Collection,
    userCollection: Collection,
    params: { name: string; administrator: User },
) {
    if (!params.name) {
        throw new Error(`parameter name has not been passed and is required`);
    }
    if (!params.administrator) {
        throw new Error(`parameter administrator has not been passed and is required`);
    }
    const adminId = params.administrator.user;
    const newInitiative: Initiative = {
        name: params.name,
        creationTS: new Date(Date.now()).toISOString(),
    };
    return insertOneObs(newInitiative, initiativeCollection).pipe(
        concatMap(initiativeId =>
            addUserAsInitiativeAdministrator(adminId, initiativeId.toHexString(), params.name, userCollection).pipe(
                map(() => initiativeId),
            ),
        ),
    );
}
function addUserAsInitiativeAdministrator(
    user: string,
    initiativeId: string,
    initiativeName: string,
    userCollection: Collection,
) {
    const dataToUpdateInUserColl = {
        $set: {
            user,
            initiativeId,
            initiativeName,
        },
        $addToSet: { roles: INITIATIVE_ADMINISTRATOR },
    };
    return updateManyObs({ user, initiativeId, initiativeName }, dataToUpdateInUserColl, userCollection, {
        upsert: true,
    }).pipe(map(() => initiativeId));
}

export function getInititives(initiativeCollection: Collection, params?: { all?: boolean }) {
    const selector = params && params.all ? {} : { $or: [{ cancelled: { $exists: false } }, { cancelled: false }] };
    return findObs(initiativeCollection, selector).pipe(
        toArray(),
        map((initiatives: Initiative[]) => initiatives.sort()),
    );
}

export function cancelInitiative(
    initiativeCollection: Collection,
    votingEventsCollection: Collection,
    votesCollection: Collection,
    usersCollection: Collection,
    params: { name?: string; _id?: any; hard?: boolean },
) {
    let retObs: Observable<any>;
    const initiativeKey = !!params._id ? { _id: getObjectId(params._id) } : { name: params.name };
    const votingEventKey = !!params._id ? { initiativeId: params._id } : { initiativeName: params.name };
    if (params.hard) {
        retObs = forkJoin(
            deleteObs(initiativeKey, initiativeCollection),
            findObs(votingEventsCollection, votingEventKey).pipe(
                // for each VotingEvent create and Observable that represents the operation to cancel it
                map((votingEvent: VotingEvent) =>
                    cancelVotingEvent(votingEventsCollection, votesCollection, { name: votingEvent.name, hard: true }),
                ),
                toArray(),
            ),
        ).pipe(
            concatMap(() => {
                const usersInitiativeKey = !!params._id
                    ? { initiativeId: params._id }
                    : { initiativeName: params.name };
                return deleteObs(usersInitiativeKey, usersCollection);
            }),
        );
    } else {
        retObs = forkJoin(
            updateManyObs(initiativeKey, { cancelled: true }, initiativeCollection),
            findObs(votingEventsCollection, votingEventKey).pipe(
                // for each VotingEvent create and Observable that represents the operation to cancel it
                map((votingEvent: VotingEvent) =>
                    cancelVotingEvent(votingEventsCollection, votesCollection, { name: votingEvent.name, hard: false }),
                ),
                toArray(),
            ),
        );
    }
    return retObs;
}
export function undoCancelInitiative(
    initiativeCollection: Collection,
    votingEventsCollection: Collection,
    votesCollection: Collection,
    params: { name?: string; _id?: any },
) {
    const initiativeKey = !!params._id ? { _id: getObjectId(params._id) } : { name: params.name };
    const votingEventKey = !!params._id ? { initiativeId: params._id } : { initiativeName: params.name };
    return findObs(votingEventsCollection, votingEventKey).pipe(
        // for each VotingEvent create and Observable that represents the operation to undo cancel it
        map((votingEvent: VotingEvent) =>
            undoCancelVotingEvent(votingEventsCollection, votesCollection, { name: votingEvent.name }),
        ),
        toArray(),
        // add to the array of cancel operations also the operation to undo cancel the initiative
        tap((undoOperations: Observable<any>[]) => {
            return undoOperations.push(updateManyObs(initiativeKey, { cancelled: false }, initiativeCollection));
        }),
        // return the observable which executes all the operations in parallel
        map(undoOperations => forkJoin(undoOperations)),
    );
}

export function loadAdministratorsForInitiative(
    initiativeCollection: Collection,
    userCollection: Collection,
    params: { name?: string; _id?: any; administrators: User[] },
    user: string,
) {
    if (!params.name && !params._id) {
        throw new Error(`Either _id or name are required to identify the Initiative`);
    }
    if (!user) {
        throw new Error(`User must be passed when invoking loadAdministratorsForInitiative`);
    }
    const initiativeKey = !!params._id ? { _id: getObjectId(params._id) } : { name: params.name };
    const selectorForUsers = !!params._id ? { user, initiativeId: params._id } : { user, initiativeName: params.name };

    // first check if the user invoking this API has the required role for this Inititative
    return findObs(userCollection, selectorForUsers).pipe(
        tap((user: User) => {
            if (!user) {
                throw new Error(
                    `User not found with id ${user} for initiative ${params.name} and initiativeId ${params._id}`,
                );
            }
            if (!user.roles || !user.roles.some(r => r === INITIATIVE_ADMINISTRATOR)) {
                const err = { ...ERRORS.userWithNotTheRequestedRole };
                err.message = `${user} is not authorized to load new administrators for the Initiative`;
                throw err;
            }
        }),
        // then check if the Inititative exists
        concatMap(() => findObs(initiativeCollection, initiativeKey)),
        tap(initiative => {
            if (!initiative) {
                throw new Error(`Initiative not found for id ${params._id} or name ${params.name}`);
            }
        }),
        concatMap((initiative: Initiative) => {
            const upsertOperations = params.administrators.map(adm => {
                return addUserAsInitiativeAdministrator(
                    adm.user,
                    initiative._id.toHexString(),
                    params.name,
                    userCollection,
                );
            });
            return forkJoin(upsertOperations);
        }),
    );
}
