import { throwError, forkJoin, of } from 'rxjs';
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
import { User } from '../model/user';
import { getInititive } from './initiative-api';
import { Initiative } from '../model/initiative';
import { addUsers, addUsersWithGroup } from './authentication-api';

// if skynny is true then 'blips' and 'technologies' propertires are removed to reduce the size of the data
export function getVotingEvents(votingEventsCollection: Collection, params?: { full?: boolean; all?: boolean }) {
    const selector = params && params.all ? {} : { cancelled: { $exists: false } };
    let options: any = params && params.full ? {} : { projection: { blips: 0, technologies: 0 } };
    return findObs(votingEventsCollection, selector, options).pipe(
        toArray(),
        map((votingEvents: VotingEvent[]) => votingEvents.sort()),
    );
}
export function getVotingEvent(votingEventsCollection: Collection, _id: any, viewCancelled = false) {
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
    const selector = viewCancelled
        ? { _id: eventId }
        : { $or: [{ cancelled: { $exists: false } }, { cancelled: false }], _id: eventId };
    return findObs(votingEventsCollection, selector).pipe(
        // take(1), does not close the cursor
        toArray(),
        map((votingEvents: VotingEvent[]) => {
            const votingEvent = votingEvents[0];
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
    const _eventId = _id._id ? _id._id : _id;
    const eventId = typeof _eventId === 'string' ? _eventId : _eventId.toHexString();
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
    initiativeCollection: Collection,
    params: {
        name: string;
        flow?: VotingEventFlow;
        initiativeName?: string;
        initiativeId?: string;
    },
    user?: string,
) {
    const newVotingEvent: VotingEvent = {
        name: params.name,
        status: 'closed',
        creationTS: new Date(Date.now()).toISOString(),
        owner: { user },
        roles: { administrators: [user] },
    };
    if (!params.initiativeId && !params.initiativeName) {
        throw `Either the id of the initiative or its name are required`;
    }
    newVotingEvent.flow = params.flow ? params.flow : CorporateVotingEventFlow;
    if (params.flow) {
        newVotingEvent.flow = params.flow;
    }
    if (params.initiativeName) {
        newVotingEvent.initiativeName = params.initiativeName;
    }
    if (params.initiativeId) {
        newVotingEvent.initiativeId = params.initiativeId;
    }

    return getInititive(initiativeCollection, { name: params.initiativeName }).pipe(
        tap(initiative => {
            verifyPermissionToCreateVotingEvent(user, initiative);
        }),
        concatMap(() => saveVotingEvents(votingEventsCollection, [newVotingEvent])),
        map(ids => ids[0]),
    );
}
function verifyPermissionToCreateVotingEvent(user: string, initiative: Initiative) {
    const isAdmin = initiative.roles.administrators.some(a => a === user);
    if (!isAdmin) {
        const err = { ...ERRORS.userWithNotTheRequestedRole };
        err.user = user;
        err.message = `${user} does not have the required permission to create VotingEvents for Initiative ${
            initiative.name
        }`;
        throw err;
    }
}
export function openVotingEvent(
    votingEventsCollection: Collection,
    technologiesCollection: Collection,
    votingEvent: { _id: string },
    user: string,
) {
    const _votingEventId = getObjectId(votingEvent._id);
    return verifyPermissionToManageVotingEvent(votingEventsCollection, user, _votingEventId, 'OPEN VOTING EVENT').pipe(
        concatMap(() => openVotingEventVerified(votingEventsCollection, technologiesCollection, votingEvent._id)),
    );
}
export function openVotingEventVerified(
    votingEventsCollection: Collection,
    technologiesCollection: Collection,
    votingEventId: string | ObjectId,
) {
    const _votingEventId = typeof votingEventId === 'string' ? getObjectId(votingEventId) : votingEventId;
    const votingEventKey = { _id: _votingEventId };
    const dataToUpdate = { status: 'open', lastOpenedTS: new Date(Date.now()).toISOString() };
    return getVotingEvent(votingEventsCollection, votingEventId).pipe(
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
export function closeVotingEvent(votingEventsCollection: Collection, votingEvent: { _id: string }, user: string) {
    const _votingEventId = getObjectId(votingEvent._id);
    const votingEventKey = { _id: _votingEventId };
    const dataToUpdate = { status: 'closed', lastClosedTS: new Date(Date.now()).toISOString() };
    const operation = updateOneObs(votingEventKey, dataToUpdate, votingEventsCollection);
    return verifyPermissionToManageVotingEvent(votingEventsCollection, user, _votingEventId, 'CLOSE VOTING EVENT').pipe(
        concatMap(() => operation),
    );
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
    const operation = updateOneObs(votingEventKey, dataToUpdate, votingEventsCollection);
    return operation;
}
export function cancelVotingEvent(
    votingEventsCollection: Collection,
    votesCollection: Collection,
    params: { _id: string | ObjectId; name?: string; hard?: boolean },
    user?: string,
) {
    let _votingEventId = typeof params._id === 'string' ? getObjectId(params._id) : params._id;

    return verifyPermissionToManageVotingEvent(
        votingEventsCollection,
        user,
        _votingEventId,
        'CANCEL VOTING EVENT',
    ).pipe(
        concatMap(() => {
            return cancelVotingEventVerified(
                votingEventsCollection,
                votesCollection,
                params._id,
                params.name,
                params.hard,
            );
        }),
    );
}
export function cancelVotingEventVerified(
    votingEventsCollection,
    votesCollection,
    _id: string | ObjectId,
    name?: string,
    hard = false,
) {
    let _votingEventId = typeof _id === 'string' ? getObjectId(_id) : _id;
    let _votingEventIdAsString = typeof _id === 'string' ? _id : _id.toHexString();
    const votingEventKey = !!_id ? { _id: _votingEventId } : { name: name };
    const votesKey = !!_id ? { eventId: _votingEventIdAsString } : { eventName: name };
    return hard
        ? forkJoin(deleteObs(votingEventKey, votingEventsCollection), deleteObs(votesKey, votesCollection))
        : forkJoin(
              updateManyObs(votingEventKey, { cancelled: true }, votingEventsCollection),
              updateManyObs(votesKey, { cancelled: true }, votesCollection),
          );
}
export function undoCancelVotingEvent(
    votingEventsCollection: Collection,
    votesCollection: Collection,
    params: { name?: string; _id: string | ObjectId },
    user?: string,
) {
    const _votingEventId = typeof params._id === 'string' ? getObjectId(params._id) : params._id;
    return verifyPermissionToManageVotingEvent(
        votingEventsCollection,
        user,
        _votingEventId,
        'UNDO CANCEL VOTING EVENT',
    ).pipe(
        concatMap(() =>
            undoCancelVotingEventVerified(votingEventsCollection, votesCollection, params._id, params.name),
        ),
    );
}
export function undoCancelVotingEventVerified(
    votingEventsCollection: Collection,
    votesCollection: Collection,
    votingEventId: string | ObjectId,
    name?: string,
) {
    let _votingEventId = typeof votingEventId === 'string' ? getObjectId(votingEventId) : votingEventId;
    const votingEventKey = !!votingEventId ? { _id: _votingEventId } : { name };
    const votesKey = !!votingEventId ? { eventId: votingEventId } : { eventName: name };
    return forkJoin(
        updateManyObs(votingEventKey, { cancelled: false }, votingEventsCollection),
        updateManyObs(votesKey, { cancelled: false }, votesCollection),
    );
}
function verifyPermissionToManageVotingEvent(
    votingEventsCollection: Collection,
    user: string,
    votingEventId: ObjectId,
    operationDescription?: string,
) {
    return getVotingEvent(votingEventsCollection, votingEventId, true).pipe(
        map(votingEvent => {
            _verifyPermissionToManageVotingEvent(user, votingEvent, operationDescription);
        }),
    );
}
function _verifyPermissionToManageVotingEvent(user: string, votingEvent: VotingEvent, operationDescription?: string) {
    const isAdmin = votingEvent.roles.administrators.some(a => a === user);
    if (!isAdmin) {
        const _operationDeascription = operationDescription ? operationDescription : 'MANAGE';
        const err = { ...ERRORS.userWithNotTheRequestedRole };
        err.user = user;
        err.message = `${user} does not have the required permission to ${_operationDeascription} VotingEvent ${
            votingEvent.name
        }`;
        throw err;
    }
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
    const eventId =
        typeof params.votingEvent._id === 'string' ? params.votingEvent._id : params.votingEvent._id.toHexString();
    // perform the calculation on the votes collection to extract the id of the winner
    const winnerObs = getVotes(votesColl, { eventId }).pipe(
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
    user: string,
) {
    return verifyPermissionToManageVotingEvent(
        votingEventsCollection,
        user,
        new ObjectId(params._id),
        'SET TECHNOLOGIES FOR VOTING EVENT',
    ).pipe(concatMap(() => setTechologiesForEventVerified(votingEventsCollection, params._id, params.technologies)));
}
export function setTechologiesForEventVerified(
    votingEventsCollection: Collection,
    votingEventId: string | ObjectId,
    technologies: Technology[],
) {
    const _votingEventId = typeof votingEventId === 'string' ? getObjectId(votingEventId) : votingEventId;
    return getVotingEvent(votingEventsCollection, _votingEventId).pipe(
        concatMap(votingEvent => {
            if (!votingEvent) {
                const err = { ...ERRORS.votingEventNotExisting };
                err.votingEventId = votingEventId;
                throw err;
            }
            technologies.forEach(t => (t._id = new ObjectId()));
            const dataToUpdate = { technologies: technologies };
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
    params: { _id: string; technologyId: string; comment: string },
    user,
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
            const newComment = buildComment(params.comment, user);
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
    user,
) {
    params.reply.author = user;
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

export function moveToNexFlowStep(
    votingEventsCollection: Collection,
    votesColl: Collection,
    params: { _id: string },
    user: string,
) {
    const _votingEventId = getObjectId(params._id);
    const operation = _calculateResultDetailsForEachTechnology(votingEventsCollection, votesColl, params).pipe(
        concatMap(votingEvent => {
            const votingEventKey = { _id: _votingEventId };
            const newRound = votingEvent.round + 1;
            const dataToUpdate = { round: newRound, technologies: votingEvent.technologies };
            return updateOneObs(votingEventKey, dataToUpdate, votingEventsCollection);
        }),
    );
    return verifyPermissionToManageVotingEvent(
        votingEventsCollection,
        user,
        _votingEventId,
        'MOVE TO NEXT STEP FOR VOTING EVENT',
    ).pipe(concatMap(() => operation));
}

// fills the 'votingResult' property of the Technologies which have collected at least one vote
// 'votingResult' contains the number of votes per ring (e.g. if a technology has received 2 HOLD and 1 ASSESS, this
// data will be contained in the 'votingResult.votesForRing' property)
// 'votingResult' contains also the number of votes per tag, if tags have been added to the votes
function _calculateResultDetailsForEachTechnology(
    votingEventsCollection: Collection,
    votesColl: Collection,
    params: { _id: string },
) {
    if (!(params && params._id)) {
        return throwError('The parameters passed to fetchVotingEvidences do not containt the id of the VotingEvent');
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
    params: { votingEventId: string; technologyName: string },
    user,
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
            if (tech.recommendation && tech.recommendation.author !== user) {
                // create a copy of the error to be able to set safely the name of the author of the recommendation in
                // the error message
                const err = { ...ERRORS.recommendationAuthorAlreadySet };
                err.message = `Recommendation already taken by "${tech.recommendation.author}"`;
                err.currentAuthor = tech.recommendation.author;
                throw err;
            }
            tech.recommendation = { author: user };
            return { votingEvent, tech, votingEventsCollection };
        }),
        concatMap(updateTechRecommendation),
    );
}

export function setRecommendation(
    votingEventsCollection: Collection,
    params: { votingEventId: string; technologyName: string; recommendation: Recommendation },
    user,
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
            if (tech.recommendation && tech.recommendation.author !== params.recommendation.author) {
                // create a copy of the error to be able to set safely the name of the author of the
                // request to reset the recommendation
                const err = { ...ERRORS.recommendationAuthorDifferent };
                err.message = `The current author of the recommendation "${tech.recommendation.author}" 
                is not the same who is sending the new recommendation "${params.recommendation.author}"`;
                err.currentAuthor = tech.recommendation.author;
                throw err;
            }
            tech.recommendation = params.recommendation;
            tech.recommendation.author = user;
            tech.recommendation.timestamp = new Date(Date.now()).toISOString();
            return { votingEvent, tech, votingEventsCollection };
        }),
        concatMap(updateTechRecommendation),
    );
}

export function resetRecommendation(
    votingEventsCollection: Collection,
    params: { votingEventId: string; technologyName: string },
    user,
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
            if (!tech.recommendation) {
                throw new Error(
                    `No recommendation set for technologgy ${params.technologyName} in VotingEvent ${votingEvent.name}`,
                );
            }
            if (tech.recommendation.author !== user) {
                // create a copy of the error to be able to set safely the name of the author of the
                // request to reset the recommendation
                const err = { ...ERRORS.recommendationAuthorDifferent };
                err.message = `The current author of the recommendation "${tech.recommendation.author}" 
                is not the same who is requesting the reset "${user}"`;
                err.currentAuthor = tech.recommendation.author;
                throw err;
            }
            tech.recommendation = null;
            return { votingEvent, tech, votingEventsCollection };
        }),
        concatMap(updateTechRecommendation),
    );
}

function updateTechRecommendation({ votingEvent, tech, votingEventsCollection }) {
    const dataToUpdate = { 'technologies.$.recommendation': tech.recommendation };
    return updateOneObs({ _id: votingEvent._id, 'technologies._id': tech._id }, dataToUpdate, votingEventsCollection);
}

export function loadAdministratorsForVotingEvent(
    votingEventCollection: Collection,
    params: {
        votingEventId: string;
        administrators: string[];
    },
    user: string,
) {
    if (!params.votingEventId) {
        throw new Error(`votingEventId is required to identify the VotingEvent for loading administrators`);
    }
    if (!user) {
        throw new Error(`User must be passed when invoking loadAdministratorsForInitiative`);
    }

    const votingEventKey = { _id: getObjectId(params.votingEventId) };

    return getVotingEvent(votingEventCollection, { _id: params.votingEventId }).pipe(
        map(votingEvent => verifyPermissionToAddAdministratorsToVotingEvent(user, votingEvent)),
        concatMap(() => {
            const dataToUpdate = { $addToSet: { 'roles.administrators': { $each: params.administrators } } };
            return updateOneObs(votingEventKey, dataToUpdate, votingEventCollection);
        }),
    );
}
function verifyPermissionToAddAdministratorsToVotingEvent(user: string, votingEvent: VotingEvent) {
    const isAdmin = votingEvent.roles.administrators.some(a => a === user);
    if (!isAdmin) {
        const err = { ...ERRORS.userWithNotTheRequestedRole };
        err.user = user;
        err.message = `${user} does not have the required permission to add administators to Voting Event ${
            votingEvent.name
        }`;
        throw err;
    }
}

export function addUsersForVotingEvent(
    votingEventCollection: Collection,
    usersCollection: Collection,
    params: {
        votingEventId: ObjectId;
        users: User[];
    },
    user: string,
) {
    if (!params.votingEventId) {
        throw new Error(`votingEventId is required to identify the VotingEven when you want to add users`);
    }
    if (!user) {
        throw new Error(`User must be passed when invoking addUsersForVotingEvent`);
    }

    return verifyPermissionToManageVotingEvent(
        votingEventCollection,
        user,
        params.votingEventId,
        'ADD USERS FOR VOTING EVENT',
    ).pipe(
        concatMap(() => {
            return addUsers(usersCollection, { users: params.users });
        }),
    );
}

// to be used to load Users read from a csv file, where for every role of a user there is one row, which means that a user with
// different roles will have more than one row
// USERS = [
//     { user: 'Mary', group: 'architect' },
//     { user: 'Mary', group: 'dev' },
//     { user: 'John', group: 'dev' },
// ]
export function loadUsersForVotingEvent(
    votingEventCollection: Collection,
    usersCollection: Collection,
    params: {
        votingEventId: ObjectId;
        users: { user: string; group: string }[];
    },
    user: string,
) {
    if (!params.votingEventId) {
        throw new Error(`votingEventId is required to identify the VotingEven when you want to add users`);
    }

    return verifyPermissionToManageVotingEvent(
        votingEventCollection,
        user,
        params.votingEventId,
        'LOAD USERS FOR VOTING EVENT',
    ).pipe(
        concatMap(() => {
            return addUsersWithGroup(usersCollection, { users: params.users });
        }),
    );
}
