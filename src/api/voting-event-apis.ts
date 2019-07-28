import { throwError, forkJoin, Observable, of } from 'rxjs';
import { toArray, switchMap, map, catchError, tap, concatMap } from 'rxjs/operators';
import { Collection, ObjectId } from 'mongodb';

import { findObs, dropObs, insertManyObs, updateOneObs, deleteObs, updateManyObs } from 'observable-mongo';

import { groupBy } from 'lodash';

import { VotingEvent } from '../model/voting-event';
import { Vote, countVoteComments } from '../model/vote';
import { getVotes } from './votes-apis';
import { ERRORS } from './errors';
import { getObjectId } from './utils';
import { getTechnologies } from './technologies-apis';
import { Technology, Recommendation } from '../model/technology';
import { buildComment, findComment } from '../model/comment';
import { Comment } from '../model/comment';
import { CorporateVotingEventFlow } from '../voting-event-flow-templates/corporate-voting-event-flow';
import { VotingEventFlow } from '../model/voting-event-flow';
import { Credentials } from '../model/credentials';

// if skynny is true then 'blips' and 'technologies' propertires are removed to reduce the size of the data
export function getVotingEvents(votingEventsCollection: Collection, params?: { full: boolean; all?: boolean }) {
    const selector = params && params.all ? {} : { cancelled: { $exists: false } };
    let options: any = params && params.full ? {} : { projection: { blips: 0, technologies: 0 } };
    return findObs(votingEventsCollection, selector, options).pipe(
        toArray(),
        map((votingEvents: VotingEvent[]) => votingEvents.sort()),
        tap(votingEvents => votingEvents.map(ve => (ve.flow = ve.flow ? ve.flow : CorporateVotingEventFlow))),
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
    const selector = { $or: [{ cancelled: { $exists: false } }, { cancelled: false }], _id: eventId };
    return findObs(votingEventsCollection, selector).pipe(
        // take(1), does not close the cursor
        toArray(),
        map((votingEvents: VotingEvent[]) => {
            const votingEvent = votingEvents[0];
            if (votingEvent && !votingEvent.flow) {
                votingEvent.flow = CorporateVotingEventFlow;
            }
            return votingEvent;
        }),
    );
}
export function getVotingEventWithNumberOfCommentsAndVotes(
    votingEventsCollection: Collection,
    votesCollection: Collection,
    _id: any,
) {
    return _getVotingEventWithNumberOfCommentsAndVotes(votingEventsCollection, votesCollection, _id).pipe(
        map(data => data.votingEvent),
    );
}
function _getVotingEventWithNumberOfCommentsAndVotes(
    votingEventsCollection: Collection,
    votesCollection: Collection,
    _id: any,
) {
    const eventId = _id._id ? _id._id : _id;
    return forkJoin(getVotingEvent(votingEventsCollection, _id), getVotes(votesCollection, { eventId })).pipe(
        map(([votingEvent, votes]) => {
            if (!votingEvent) throw Error(`No Voting Event present with ID ${_id}`);
            const technologies = votingEvent.technologies;
            if (!technologies) throw Error(`No Technologies defined for Voting Event ${votingEvent.name}`);
            const votesGroupedByTech = groupBy(votes, 'technology._id');
            Object.entries(votesGroupedByTech).forEach(([id, votes]) => {
                const tech = technologies.find(t => {
                    const techId: any = t._id;
                    return techId.toHexString() === id;
                });
                tech.numberOfVotes = votes.length;
                const numberOfComments = votes.reduce((acc, vote) => acc + countVoteComments(vote), 0);
                tech.numberOfComments = numberOfComments;
            });
            return { votingEvent, votesGroupedByTech };
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
export function createNewVotingEvent(
    votingEventsCollection: Collection,
    params: {
        name: string;
        flow?: VotingEventFlow;
        creator: Credentials;
        initiativeName?: string;
        initiativeId?: string;
    },
) {
    const newVotingEvent: VotingEvent = {
        name: params.name,
        status: 'closed',
        creationTS: new Date(Date.now()).toISOString(),
        creator: params.creator,
    };
    if (params.flow) {
        newVotingEvent.flow = params.flow;
    }
    if (params.initiativeName) {
        newVotingEvent.initiativeName = params.initiativeName;
    }
    if (params.initiativeId) {
        newVotingEvent.initiativeId = params.initiativeId;
    }
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
                // retrieve technologies from backend if this voting event has got none yet
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
export function undoCancelVotingEvent(
    votingEventsCollection: Collection,
    votesCollection: Collection,
    params: { name?: string; _id?: any },
) {
    const votingEventKey = !!params._id ? { _id: getObjectId(params._id) } : { name: params.name };
    const votesKey = !!params._id ? { eventId: params._id } : { eventName: params.name };
    return forkJoin(
        updateManyObs(votingEventKey, { cancelled: false }, votingEventsCollection),
        updateManyObs(votesKey, { cancelled: false }, votesCollection),
    );
}
export function getVoters(votesColl: Collection, params: { votingEvent: any }) {
    return getVotes(votesColl, { eventId: params.votingEvent._id }).pipe(
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
    const winnerObs = getVotes(votesColl, { eventId: params.votingEvent._id }).pipe(
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

export function setTechologiesForEvent(
    votingEventsCollection: Collection,
    params: { _id: string; technologies: Technology[] },
) {
    return getVotingEvent(votingEventsCollection, params._id).pipe(
        concatMap(votingEvent => {
            if (!votingEvent) {
                throw ERRORS.votingEventNotExisting;
            }
            params.technologies.forEach(t => (t._id = new ObjectId()));
            const dataToUpdate = { technologies: params.technologies };
            return updateOneObs({ _id: votingEvent._id }, dataToUpdate, votingEventsCollection);
        }),
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
            const tech = params.technology;
            tech._id = new ObjectId();
            const dataToUpdate = { $push: { technologies: tech } };
            return updateOneObs({ _id: votingEvent._id }, dataToUpdate, votingEventsCollection);
        }),
    );
}

export function addCommentToTech(
    votingEventsCollection: Collection,
    params: { _id: string; technologyId: string; comment: string; author: string },
) {
    return getVotingEvent(votingEventsCollection, params._id).pipe(
        switchMap(votingEvent => {
            if (!votingEvent) {
                throw ERRORS.votingEventNotExisting;
            }
            const techs = votingEvent.technologies;
            const tech = techs.find(t => {
                const techId = t._id as ObjectId;
                return techId.toHexString() === params.technologyId;
            });
            if (!tech) {
                throw ERRORS.techNotPresentInVotingEvent;
            }
            if (!tech.comments) {
                tech.comments = [];
            }
            const newComment = buildComment(params.comment, params.author);
            tech.comments.push(newComment);
            const dataToUpdate = { 'technologies.$.comments': tech.comments };
            return updateOneObs(
                { _id: votingEvent._id, 'technologies._id': tech._id },
                dataToUpdate,
                votingEventsCollection,
            );
        }),
    );
}

// adds a reply to a comment present in a Tech
export function addReplyToTechComment(
    votingEventsCollection: Collection,
    params: { votingEventId: string; technologyId: string; reply: Comment; commentReceivingReplyId: string },
) {
    const findVotingEventSelector = { _id: getObjectId(params.votingEventId) };
    let dataToUpdate;
    let votingEvent: VotingEvent;
    let tech: Technology;
    return findObs(votingEventsCollection, findVotingEventSelector).pipe(
        // toArray is used here to ba able to manage properly the case
        // where no VotingEvent is found
        toArray(),
        tap(vEvents => {
            if (vEvents.length === 0) {
                throw `no VotingEvent with id ${params.votingEventId} found in collection ${
                    votingEventsCollection.collectionName
                }`;
            }
            votingEvent = vEvents[0];
        }),
        map((vEvents: VotingEvent[]) => vEvents[0].technologies),
        tap(technologies => {
            if (!technologies || technologies.length === 0) {
                throw `VotingEvent "${votingEvent.name}" has no technologies defined`;
            }
        }),
        map(technologies => technologies.find((t: any) => t._id.toHexString() === params.technologyId)),
        tap(technology => {
            if (!technology) {
                throw `VotingEvent "${votingEvent.name}" has no technology with id ${params.technologyId}`;
            }
            tech = technology;
            if (!technology.comments || technology.comments.length === 0) {
                throw `Technology ${technology.name} in VotingEvent "${votingEvent.name}" has no comments`;
            }
        }),
        map(techology => {
            const comments = techology.comments;
            let commentToReplyTo: Comment;
            for (let comment of comments) {
                commentToReplyTo = findComment(comment, params.commentReceivingReplyId);
                if (commentToReplyTo) {
                    break;
                }
            }
            return commentToReplyTo;
        }),
        tap(commentToReplyTo => {
            if (!commentToReplyTo) {
                throw `VotingEvent "${votingEvent.name}" has no comment with id ${
                    params.commentReceivingReplyId
                } for technology ${tech.name}`;
            }
            dataToUpdate = { 'technologies.$.comments': tech.comments };
            if (!commentToReplyTo.replies) {
                commentToReplyTo.replies = [];
            }
            const newComment = buildComment(params.reply.text, params.reply.author);
            commentToReplyTo.replies.push(newComment);
        }),
        concatMap(() =>
            updateOneObs({ _id: votingEvent._id, 'technologies._id': tech._id }, dataToUpdate, votingEventsCollection),
        ),
    );
}

export function moveToNexFlowStep(votingEventsCollection: Collection, votesColl: Collection, params: { _id: string }) {
    return fetchVotingEvidences(votingEventsCollection, votesColl, params).pipe(
        concatMap(votingEvent => {
            const votingEventKey = { _id: getObjectId(params._id) };
            const newRound = votingEvent.round + 1;
            const dataToUpdate = { round: newRound, technologies: votingEvent.technologies };
            return updateOneObs(votingEventKey, dataToUpdate, votingEventsCollection);
        }),
    );
}
export function fetchVotingEvidences(
    votingEventsCollection: Collection,
    votesColl: Collection,
    params: { _id: string },
) {
    if (!(params && params._id)) {
        return throwError('The parameters passed to fetchVotingEvidences do not containt the VotingEvent is');
    }
    const eventId = params._id;
    return _getVotingEventWithNumberOfCommentsAndVotes(votingEventsCollection, votesColl, eventId).pipe(
        map(({ votingEvent, votesGroupedByTech }) => {
            Object.entries(votesGroupedByTech).forEach(([id, votes]) => {
                const tech = votingEvent.technologies.find(t => {
                    const techId: any = t._id;
                    return techId.toHexString() === id;
                });
                tech.votingResult = {
                    votesForRing: [],
                };
                const votesGroupedByRing = groupBy(votes, 'ring');
                Object.entries(votesGroupedByRing).forEach(([ring, votes]) => {
                    tech.votingResult.votesForRing.push({ ring, count: votes.length });
                });
                const votesGroupedByTag = new Map<string, Vote[]>();
                votes.forEach(vote => {
                    const voteTags = vote.tags;
                    if (voteTags) {
                        voteTags.forEach(tag => {
                            if (!votesGroupedByTag.get(tag)) {
                                votesGroupedByTag.set(tag, []);
                            }
                            votesGroupedByTag.get(tag).push(vote);
                        });
                    }
                });
                votesGroupedByTag.forEach((votes, tag) => {
                    if (!tech.votingResult.votesForTag) {
                        tech.votingResult.votesForTag = [];
                    }
                    tech.votingResult.votesForTag.push({ tag, count: votes.length });
                });
            });
            return votingEvent;
        }),
    );
}

export function setRecommendationAuthor(
    votingEventsCollection: Collection,
    params: { votingEventId: string; technologyName: string; author: string },
) {
    return getVotingEvent(votingEventsCollection, params.votingEventId).pipe(
        map(votingEvent => {
            if (!votingEvent) {
                throw new Error(`VotingEvent ${votingEvent.name} not found`);
            }
            const tech = votingEvent.technologies.find(t => t.name === params.technologyName);
            if (!tech) {
                throw new Error(
                    `Technologgy with id ${params.technologyName} not found in VotingEvent ${votingEvent.name}`,
                );
            }
            if (tech.recommendandation && tech.recommendandation.author !== params.author) {
                // create a copy of the error to be able to set safely the name of the author of the recommendation in
                // the error message
                const err = { ...ERRORS.recommendationAuthorAlreadySet };
                err.message = `Recommendation already taken by "${tech.recommendandation.author}"`;
                err.currentAuthor = tech.recommendandation.author;
                throw err;
            }
            tech.recommendandation = { author: params.author };
            return { votingEvent, tech, votingEventsCollection };
        }),
        concatMap(updateTechRecommendation),
    );
}

export function setRecommendation(
    votingEventsCollection: Collection,
    params: { votingEventId: string; technologyName: string; recommendation: Recommendation },
) {
    return getVotingEvent(votingEventsCollection, params.votingEventId).pipe(
        map(votingEvent => {
            if (!votingEvent) {
                throw new Error(`VotingEvent ${votingEvent.name} not found`);
            }
            const tech = votingEvent.technologies.find(t => t.name === params.technologyName);
            if (!tech) {
                throw new Error(`Technologgy ${params.technologyName} not found in VotingEvent ${votingEvent.name}`);
            }
            if (tech.recommendandation && tech.recommendandation.author !== params.recommendation.author) {
                // create a copy of the error to be able to set safely the name of the author of the
                // request to reset the recommendation
                const err = { ...ERRORS.recommendationAuthorDifferent };
                err.message = `The current author of the recommendation "${tech.recommendandation.author}" 
                is not the same who is sending the new recommendation "${params.recommendation.author}"`;
                err.currentAuthor = tech.recommendandation.author;
                throw err;
            }
            tech.recommendandation = params.recommendation;
            tech.recommendandation.timestamp = new Date(Date.now()).toISOString();
            return { votingEvent, tech, votingEventsCollection };
        }),
        concatMap(updateTechRecommendation),
    );
}

export function resetRecommendation(
    votingEventsCollection: Collection,
    params: { votingEventId: string; technologyName: string; requester: string },
) {
    return getVotingEvent(votingEventsCollection, params.votingEventId).pipe(
        map(votingEvent => {
            if (!votingEvent) {
                throw new Error(`VotingEvent ${votingEvent.name} not found`);
            }
            const tech = votingEvent.technologies.find(t => t.name === params.technologyName);
            if (!tech) {
                throw new Error(`Technologgy ${params.technologyName} not found in VotingEvent ${votingEvent.name}`);
            }
            if (!tech.recommendandation) {
                throw new Error(
                    `No recommendation set for technologgy ${params.technologyName} in VotingEvent ${votingEvent.name}`,
                );
            }
            if (tech.recommendandation.author !== params.requester) {
                // create a copy of the error to be able to set safely the name of the author of the
                // request to reset the recommendation
                const err = { ...ERRORS.recommendationAuthorDifferent };
                err.message = `The current author of the recommendation "${tech.recommendandation.author}" 
                is not the same who is requesting the reset "${params.requester}"`;
                err.currentAuthor = tech.recommendandation.author;
                throw err;
            }
            tech.recommendandation = null;
            return { votingEvent, tech, votingEventsCollection };
        }),
        concatMap(updateTechRecommendation),
    );
}

function updateTechRecommendation({ votingEvent, tech, votingEventsCollection }) {
    const dataToUpdate = { 'technologies.$.recommendandation': tech.recommendandation };
    return updateOneObs({ _id: votingEvent._id, 'technologies._id': tech._id }, dataToUpdate, votingEventsCollection);
}
