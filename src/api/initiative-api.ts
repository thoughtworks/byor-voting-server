import { Collection } from 'mongodb';
import { toArray, map, tap } from 'rxjs/operators';
import { Observable, forkJoin } from 'rxjs';

import { insertOneObs, findObs, deleteObs, updateManyObs } from 'observable-mongo';

import { Initiative } from '../model/initiative';
import { getObjectId } from './utils';
import { cancelVotingEvent, undoCancelVotingEvent } from './voting-event-apis';
import { VotingEvent } from '../model/voting-event';

export function createInitiative(initiativeCollection: Collection, params: { name: string }) {
    const newInitiative: Initiative = {
        name: params.name,
        creationTS: new Date(Date.now()).toISOString(),
    };
    return insertOneObs(newInitiative, initiativeCollection);
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
