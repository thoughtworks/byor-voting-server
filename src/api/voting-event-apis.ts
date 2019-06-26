import { throwError, forkJoin, Observable, of } from 'rxjs';
import { toArray, switchMap, map, catchError } from 'rxjs/operators';
import { Collection, ObjectId } from 'mongodb';

import { findObs, dropObs, insertManyObs, updateOneObs, deleteObs, updateManyObs } from 'observable-mongo';

import { VotingEvent } from '../model/voting-event';
import { Vote } from '../model/vote';
import { getVotes } from './votes-apis';
import { ERRORS } from './errors';
import { getObjectId } from './utils';
import { getTechnologies } from './technologies-apis';
import { Technology } from '../model/technology';

// if skynny is true then 'blips' and 'technologies' propertires are removed to reduce the size of the data
export function getVotingEvents(votingEventsCollection: Collection, params?: { full: boolean; all?: boolean }) {
    const selector = params && params.all ? {} : { cancelled: { $exists: false } };
    let options: any = params && params.full ? {} : { projection: { blips: 0, technologies: 0 } };
    return findObs(votingEventsCollection, selector, options).pipe(
        toArray(),
        map((votingEvents: VotingEvent[]) => votingEvents.sort()),
    );
}
export function getVotingEvent(votingEventsCollection: Collection, _id: any) {
    let thisId = _id;
    if (_id._id) {
        thisId = _id._id;
    }
    let eventId: ObjectId;
    // function getEventId can throw an exception is thisId is not a valid id
    // we need to catch this and return throwError so that the execution can continue and the error condition is managed
    // by the central error management logic
    try {
        eventId = getObjectId(thisId);
    } catch (err) {
        return throwError(err);
    }
    const selector = { cancelled: { $exists: false }, _id: eventId };
    return findObs(votingEventsCollection, selector).pipe(
        // take(1), does not close the cursor
        toArray(),
        map((votingEvents: VotingEvent[]) => {
            return votingEvents[0];
        }),
    );
}
export function getAllVotingEvents(votingEventsCollection: Collection) {
    return findObs(votingEventsCollection).pipe(
        toArray(),
        map((votingEvents: VotingEvent[]) => votingEvents.sort()),
    );
}
export function laodVotingEvents(votingEventsCollection: Collection, votingEvents: VotingEvent[]) {
    return dropObs(votingEventsCollection).pipe(switchMap(() => votingEventsCollection.insertMany(votingEvents)));
}
export function deleteVotingEvents(votingEventsCollection: Collection) {
    return dropObs(votingEventsCollection);
}
export function saveVotingEvents(votingEventsCollection: Collection, votingEvents: VotingEvent[]) {
    return insertManyObs(votingEvents, votingEventsCollection).pipe(
        catchError(err => {
            if (err.code === ERRORS.votingEventAlreadyPresent.mongoErrorCode) {
                return throwError(ERRORS.votingEventAlreadyPresent);
            } else {
                return throwError(err);
            }
        }),
    );
}
export function createNewVotingEvent(votingEventsCollection: Collection, votingEvent: { name: string }) {
    const newVotingEvent: VotingEvent = {
        name: votingEvent.name,
        status: 'closed',
        creationTS: new Date(Date.now()).toISOString(),
    };
    return saveVotingEvents(votingEventsCollection, [newVotingEvent]).pipe(map(ids => ids[0]));
}
export function openVotingEvent(
    votingEventsCollection: Collection,
    technologiesCollection: Collection,
    votingEvent: { _id: string },
) {
    const votingEventKey = { _id: getObjectId(votingEvent._id) };
    const dataToUpdate = { status: 'open', lastOpenedTS: new Date(Date.now()).toISOString() };
    return getVotingEvent(votingEventsCollection, votingEvent._id).pipe(
        switchMap(votingEvent => {
            if (!votingEvent.round) {
                // initialize round if this is if this voting event has none yet
                dataToUpdate['round'] = 1;
            }
            if (!votingEvent.technologies) {
                // retrieve technologies from backend if this voting event has none yet
                return getTechnologies(technologiesCollection);
            } else {
                return of(null);
            }
        }),
        map(technologies => {
            if (technologies) {
                // initialize technologies if this is the first time the votingEvent is opened
                dataToUpdate['technologies'] = technologies.technologies;
            }
        }),
        switchMap(() => updateOneObs(votingEventKey, dataToUpdate, votingEventsCollection)),
    );
}
export function closeVotingEvent(votingEventsCollection: Collection, votingEvent: { _id: string }) {
    const votingEventKey = { _id: getObjectId(votingEvent._id) };
    const dataToUpdate = { status: 'closed', lastClosedTS: new Date(Date.now()).toISOString() };
    return updateOneObs(votingEventKey, dataToUpdate, votingEventsCollection);
}
export function openForRevote(votingEventsCollection: Collection, votingEvent: { _id: string; round: number }) {
    const votingEventKey = { _id: getObjectId(votingEvent._id) };
    let dataToUpdate;
    return getVotingEvent(votingEventsCollection, votingEvent._id).pipe(
        switchMap(_votingEvent => {
            if (_votingEvent.round !== votingEvent.round) {
                return throwError(
                    'Voting event with id ' +
                        votingEvent._id +
                        ' is not at round ' +
                        votingEvent.round +
                        '. It can not be openForRevote.',
                );
            } else {
                const newRound = votingEvent.round + 1;
                dataToUpdate = { openForRevote: true, round: newRound };
                return updateOneObs(votingEventKey, dataToUpdate, votingEventsCollection);
            }
        }),
    );
}
export function closeForRevote(votingEventsCollection: Collection, votingEvent: { _id: string }) {
    const votingEventKey = { _id: getObjectId(votingEvent._id) };
    const dataToUpdate = { openForRevote: false };
    return updateOneObs(votingEventKey, dataToUpdate, votingEventsCollection);
}
export function cancelVotingEvent(
    votingEventsCollection: Collection,
    votesCollection: Collection,
    params: { name?: string; _id?: any; hard?: boolean },
) {
    let retObs: Observable<any>;
    const votingEventKey = !!params._id ? { _id: getObjectId(params._id) } : { name: params.name };
    const votesKey = !!params._id ? { eventId: params._id } : { eventName: params.name };
    if (params.hard) {
        // do something to differenciate hard remove, i.e. physical cancellation, from soft remove, i.e. "logical cancellation"
        retObs = forkJoin(deleteObs(votingEventKey, votingEventsCollection), deleteObs(votesKey, votesCollection));
    } else {
        retObs = forkJoin(
            updateManyObs(votingEventKey, { cancelled: true }, votingEventsCollection),
            updateManyObs(votesKey, { cancelled: true }, votesCollection),
        );
    }
    return retObs;
}
export function getVoters(votesColl: Collection, params: { votingEvent: any }) {
    return getVotes(votesColl, params.votingEvent._id).pipe(
        map(votes => {
            const voters = votes.map(vote => `${vote.voterId.firstName} ${vote.voterId.lastName}`);
            return Array.from(new Set(voters));
        }),
    );
}

export function calculateWinner(
    votesColl: Collection,
    votingEventsCollection: Collection,
    params: { votingEvent: any },
) {
    // perform the calculation on the votes collection to extract the id of the winner
    const winnerObs = getVotes(votesColl, params.votingEvent._id).pipe(
        // as first simulation I take the first one as winner
        map((votes: Vote[]) => votes[0]),
        map(vote => ({ winner: vote.voterId, ipAdrressWinner: vote.ipAddress })),
    );
    // update the VotingEvent with the winner
    return winnerObs.pipe(
        switchMap(winner =>
            updateOneObs({ _id: new ObjectId(params.votingEvent._id) }, winner, votingEventsCollection),
        ),
    );
}

export function addNewTechnologyToEvent(
    votingEventsCollection: Collection,
    params: { _id: string; technology: Technology },
) {
    return getVotingEvent(votingEventsCollection, params._id).pipe(
        switchMap(votingEvent => {
            if (!votingEvent) {
                throw ERRORS.votingEventNotExisting;
            }
            const techs = votingEvent.technologies;
            const isTechPresent = techs && techs.find(t => t.name === params.technology.name);
            if (isTechPresent) {
                throw ERRORS.techPresentInVotingEvent;
            }
            const dataToUpdate = { $push: { technologies: params.technology } };
            return updateOneObs({ _id: votingEvent._id }, dataToUpdate, votingEventsCollection);
        }),
    );
}
