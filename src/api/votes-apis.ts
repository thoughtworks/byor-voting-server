import { Observable, throwError, forkJoin } from 'rxjs';
import { toArray, switchMap, map, tap, filter, concatMap } from 'rxjs/operators';
// import {groupBy as rxGroupBy} from 'rxjs/operators'
import { Collection, ObjectId } from 'mongodb';

import { map as _map } from 'lodash';
// import groupBy from 'lodash/groupBy';

import { findObs, dropObs, insertManyObs, aggregateObs, updateOneObs } from 'observable-mongo';

import { Vote } from '../model/vote';
import { VoteCredentialized } from '../model/vote-credentialized';
import { VoteCredentials } from '../model/vote-credentials';
import { Blip } from '../model/blip';
import { RefreshTrigger } from '../refresh-trigger';
import { ERRORS } from './errors';
import { AggregatedVote, AggregatedVoteForRing } from '../model/aggregated-vote';
import { getVotingEvent } from './voting-event-apis';
import { config } from './config';
import { cloneDeep } from 'lodash';
import { buildComment, findComment } from '../model/comment';
import { Comment } from '../model/comment';
import { getObjectId } from './utils';
import { logError } from '../lib/utils';
import { Credentials } from '../model/credentials';

export function getVotes(votesColl: Collection, id?: string | { eventId: string }): Observable<Vote[]> {
    let eventId: any;
    if (id && typeof id === 'string') {
        eventId = id;
    } else if (id) {
        eventId = id['eventId'];
    }
    const selector = eventId ? { cancelled: { $exists: false }, eventId } : { cancelled: { $exists: false } };
    return findObs(votesColl, selector).pipe(toArray());
}
export function getAllVotes(votesColl: Collection): Observable<Vote[]> {
    return findObs(votesColl).pipe(toArray());
}
export function laodVotes(votesColl: Collection, votes) {
    return dropObs(votesColl).pipe(
        switchMap(() => votesColl.insertMany(votes)),
        map(result => ({ result })),
    );
}
export function deleteVotes(votesColl: Collection) {
    return dropObs(votesColl).pipe(map(result => ({ result })));
}
export function hasAlreadyVoted(
    votesColl: Collection,
    votingEventColl: Collection,
    credObj: { credentials: VoteCredentials },
) {
    const vId = credObj.credentials.voterId;
    const eventId = credObj.credentials.votingEvent._id;
    const voterId = voterIdToUpperCase(vId);
    const selector = { voterId, eventId };
    return forkJoin(findObs(votesColl, selector).pipe(toArray<Vote>()), getVotingEvent(votingEventColl, eventId)).pipe(
        map(([votes, vEvent]) => {
            if (!votes || votes.length === 0) {
                return false;
            }
            const maxEventRound = Math.max(...votes.map(a => a.eventRound));
            return maxEventRound === vEvent.round;
        }),
    );
}
export function saveVotes(
    votesColl: Collection,
    votingEventColl: Collection,
    vote: VoteCredentialized,
    ipAddress: string,
) {
    // added to collect info about a bug that occurs sometimes in prod
    if (!vote.credentials) {
        logError('Credentials empty' + JSON.stringify(vote, null, 2) + 'ip' + ipAddress);
    }
    const voterId = voterIdToUpperCase(vote.credentials.voterId);
    const eventId = vote.credentials.votingEvent._id;
    let eventName;
    let eventRound;
    let votesToInsert;
    return getVotingEvent(votingEventColl, eventId).pipe(
        tap(vEvent => {
            eventName = vEvent.name;
            eventRound = vEvent.round;
            votesToInsert = vote.votes.map(v => {
                const voteToSave: Vote = {
                    ring: v.ring,
                    technology: v.technology,
                    voterId,
                    eventName,
                    eventId,
                    eventRound,
                    ipAddress,
                    tags: v.tags,
                };
                if (v.comment) {
                    const comment = buildComment(v.comment.text, `${voterId.firstName} ${voterId.lastName}`);
                    voteToSave.comment = comment;
                }
                return voteToSave;
            });
        }),
        switchMap(() => hasAlreadyVoted(votesColl, votingEventColl, { credentials: vote.credentials })),
        switchMap(alreadyVoted => {
            if (alreadyVoted) {
                return throwError(ERRORS.voteAlreadyPresent);
            } else {
                return insertManyObs(votesToInsert, votesColl);
            }
        }),
        tap(() => RefreshTrigger.refresh()),
    );
}
function voterIdToUpperCase(voterId: { firstName: string; lastName: string } | Credentials) {
    // @todo remove the logic to manage firstName and lastName when only nickname and userids are going to be used
    let resp;
    if (voterId['firstName']) {
        resp = {
            firstName: voterId['firstName'].toUpperCase().trim(),
            lastName: voterId['lastName'].toUpperCase().trim(),
        };
    } else {
        resp = {
            nickname: voterId['nickname'] ? voterId['nickname'].toUpperCase().trim() : '',
            userId: voterId['userId'] ? voterId['userId'].toUpperCase().trim() : '',
        };
    }
    return resp;
}

// export function getVoteComments(votesColl: Collection, technologyId: any, votingEventId: any) {}

export function aggregateVotes(
    votesColl: Collection,
    params?: { votingEvent: { _id: string | ObjectId } },
): Observable<AggregatedVote[]> {
    const aggregationPipeline = [];
    if (params && params.votingEvent) {
        aggregationPipeline.push({ $match: { eventId: params.votingEvent._id } });
    }
    aggregationPipeline.push(
        ...[
            {
                $group: {
                    _id: { id: '$eventId', tech: '$technology.name', ring: '$ring', event: '$eventName' },
                    quadrant: { $first: '$technology.quadrant' },
                    isNew: { $first: '$technology.isNew' },
                    eventName: { $first: '$eventName' },
                    count: { $sum: 1 },
                },
            },
            { $sort: { '_id.tech': 1, '_id.ring': 1, count: -1 } },
            {
                $group: {
                    _id: { tech: '$_id.tech', ring: '$_id.ring' },
                    quadrant: { $first: '$quadrant' },
                    isNew: { $first: '$isNew' },
                    votesForEvent: { $push: { id: '$_id.id', eventName: '$_id.event', count: '$count' } },
                    count: { $sum: '$count' },
                },
            },
            { $sort: { '_id.tech': 1, count: -1 } },
            {
                $group: {
                    _id: { tech: '$_id.tech' },
                    quadrant: { $first: '$quadrant' },
                    isNew: { $first: '$isNew' },
                    votesForRing: { $push: { ring: '$_id.ring', count: '$count', votesForEvent: '$votesForEvent' } },
                    count: { $sum: '$count' },
                },
            },
            {
                $project: {
                    _id: 0,
                    technology: '$_id.tech',
                    quadrant: 1,
                    isNew: 1,
                    count: 1,
                    votesForRing: 1,
                },
            },
            { $sort: { technology: 1 } },
        ],
    );
    return aggregateObs(votesColl, aggregationPipeline).pipe(toArray());
}

export function calculateBlips(
    votesColl: Collection,
    votingEventsCollection: Collection,
    params: {
        votingEvent: { _id: string | ObjectId };
        thresholdForRevote: number;
    },
) {
    if (!(params && params.votingEvent)) {
        return throwError('could not find votingEvent from given params');
    }
    return forkJoin(
        aggregateVotes(votesColl, params),
        getVotingEvent(votingEventsCollection, params.votingEvent._id),
    ).pipe(
        map(([aggregatedVotes, votingEvent]) => {
            const blips = blipsFromAggregatedVotes(aggregatedVotes, params, false);
            return { blips, votingEvent };
        }),
        switchMap(({ blips, votingEvent }) => {
            const votingEventKey = { _id: getObjectId(params.votingEvent._id) };
            const blipsForRevote = blips.filter(b =>
                isVoteUncertain(b.votes, b.numberOfVotes, params.thresholdForRevote),
            );
            const technologies = votingEvent.technologies.map(t => {
                t.forRevote = false;
                return t;
            });
            let hasTechnologiesForRevote = false;
            blipsForRevote.forEach(b => {
                b.forRevote = true;
                const tech = technologies.find(t => t.name === b.name);
                if (tech) {
                    hasTechnologiesForRevote = true;
                    tech.forRevote = true;
                    tech.description = b.description;
                }
            });
            return updateOneObs(
                votingEventKey,
                { blips, technologies, openForRevote: false, hasTechnologiesForRevote },
                votingEventsCollection,
            ).pipe(map(() => blips));
        }),
    );
}

export function calculateBlipsFromAllEvents(votesColl: Collection, _params?: any) {
    return aggregateVotes(votesColl).pipe(
        map(aggregatedVotes => {
            return blipsFromAggregatedVotes(aggregatedVotes, _params, true);
        }),
    );
}

function blipsFromAggregatedVotes(aggregatedVotes: AggregatedVote[], params: any, shouldAddEvent: boolean) {
    const blips = aggregatedVotes.map((aggVote, index) => {
        const ring = aggVote.votesForRing.sort((a, b) => b.count - a.count)[0].ring;
        const description = blipDescription(cloneDeep(aggVote), params, shouldAddEvent);

        const blip: Blip = {
            name: aggVote.technology,
            quadrant: aggVote.quadrant,
            isNew: aggVote.isNew,
            numberOfVotes: aggVote.count,
            votes: aggVote.votesForRing,
            number: index,
            ring,
            description,
        };
        return blip;
    });
    const blipsOrderedByNumberOfVotes = blips.sort((a, b) => b.numberOfVotes - a.numberOfVotes);
    return blipsOrderedByNumberOfVotes;
}

function addSelectedRingDescription(aggregatedVoteForRing, params, shouldAddEvent) {
    let desc = '<i><strong><b>Selected by: </b></strong></i>';
    return buildEvents(shouldAddEvent, aggregatedVoteForRing, desc, params);
}

function blipDescription(aggregatedVote: AggregatedVote, params: any, shouldAddEvent: boolean) {
    const numberOfVotes = aggregatedVote.count;
    let aggregatedVoteForRing = aggregatedVote.votesForRing.shift();

    let desc = '<strong>Votes: ' + numberOfVotes + '</strong><br>' + '<br>';

    desc = desc + addSelectedRingDescription(aggregatedVoteForRing, params, shouldAddEvent) + '<br>';

    if (aggregatedVote.votesForRing.length > 0) {
        return desc + addOtherRingsToDescription(aggregatedVote.votesForRing, params, shouldAddEvent);
    }
    return desc;
}

function addOtherRingsToDescription(votesForRing: AggregatedVoteForRing[], params, shouldAddEvent: boolean) {
    let desc = '<i><strong><b>Other ratings: </b></strong></i>';
    votesForRing.forEach(vote => {
        desc = buildEvents(shouldAddEvent, vote, desc, params);
    });
    return desc;
}

function buildEvents(shouldAddEvent, aggregatedVoteForRing: AggregatedVoteForRing, desc: string, params) {
    if (shouldAddEvent) {
        aggregatedVoteForRing &&
            aggregatedVoteForRing.votesForEvent.forEach(voteEvent => {
                desc = desc + buildEventNameUrl(params, voteEvent);
            });
        return desc;
    }
    return desc + '<br>' + aggregatedVoteForRing.ring.toUpperCase() + ' (' + aggregatedVoteForRing.count + ')';
}

function buildEventNameUrl(params, voteForEvent) {
    let eventName = '<li>';
    const _threshold = params && params.thresholdForRevote ? params.thresholdForRevote : config.thresholdForRevote;
    if (params && params.radarUrl && params.baseUrl) {
        const encodedUrl = encodeURIComponent(
            params.baseUrl +
                'votes/' +
                voteForEvent['id'] +
                '/blips.csv?thresholdForRevote=' +
                _threshold +
                '&type=csv',
        );
        eventName =
            eventName +
            "<a href='" +
            params.radarUrl +
            '?title=' +
            voteForEvent.eventName +
            '&sheetId=' +
            encodedUrl +
            "' target='_blank'/>";
    }
    return eventName + voteForEvent.eventName + '(' + voteForEvent.count + ')</li>';
}

function isVoteUncertain(votes: AggregatedVoteForRing[], numberOfVotes: number, thresholdForRevote: number) {
    const _threshold = thresholdForRevote ? thresholdForRevote : config.thresholdForRevote;
    if (votes.length < 2) {
        // there are not enough votes to declare it uncertain
        return false;
    }
    const topVote = votes[0];
    const secondTopVote = votes[1];
    const weightedVoteDifference = ((topVote.count - secondTopVote.count) / numberOfVotes) * 100;
    return weightedVoteDifference < _threshold;
}

// retrieves the comments addeed to the votes for a specific technology
// if an eventId is passed, then the search is limited to that eventId
export function getVotesCommentsForTech(
    votesColl: Collection,
    params: {
        technologyId: string;
        eventId?: string;
    },
) {
    const selector: any = {
        $or: [{ cancelled: { $exists: false } }, { cancelled: false }],
        'technology._id': params.technologyId,
    };
    if (params.eventId) {
        selector.eventId = params.eventId;
    }
    return findObs(votesColl, selector).pipe(
        map((vote: Vote) => vote.comment),
        filter(comment => (comment ? true : false)),
        toArray(),
    );
}

// retrieves and returns all the votes that, for a certain eventId and a certain technology, have some comments
export function getVotesWithCommentsForTechAndEvent(
    votesColl: Collection,
    params: {
        technologyId: string;
        eventId: string;
    },
) {
    const selector: any = {
        $or: [{ cancelled: { $exists: false } }, { cancelled: false }],
        'technology._id': params.technologyId,
        eventId: params.eventId,
    };
    return findObs(votesColl, selector).pipe(
        filter(vote => (vote.comment ? true : false)),
        toArray(),
    );
}

// adds a reply to a comment present in a Vote
export function addReplyToVoteComment(
    votesColl: Collection,
    params: { voteId: string; reply: Comment; commentReceivingReplyId: string },
) {
    const findVoteSelector = { _id: getObjectId(params.voteId) };
    let dataToUpdate;
    return findObs(votesColl, findVoteSelector).pipe(
        // toArray is used here to ba able to manage properly the case
        // where no vote is found
        toArray(),
        tap(vote => {
            if (vote.length === 0) {
                throw `no vote with id ${params.voteId} found`;
            }
        }),
        map((votes: Vote[]) => votes[0].comment),
        tap(topLevelComment => {
            dataToUpdate = { comment: topLevelComment, lastUpdateTS: new Date(Date.now()).toISOString() };
        }),
        map(comment => findComment(comment, params.commentReceivingReplyId)),
        tap(commentToReplyTo => {
            if (!commentToReplyTo) {
                throw `no comment to reply to with id ${params.commentReceivingReplyId} found in comment for voteId ${
                    params.voteId
                }`;
            }
        }),
        tap(commentToReplyTo => {
            if (!commentToReplyTo.replies) {
                commentToReplyTo.replies = [];
            }
            const newComment = buildComment(params.reply.text, params.reply.author);
            commentToReplyTo.replies.push(newComment);
        }),
        concatMap(() => updateOneObs(findVoteSelector, dataToUpdate, votesColl)),
    );
}
