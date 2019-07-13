import { Technology } from './technology';
import { Comment } from './comment';
import { ObjectId } from 'mongodb';

export interface Vote {
    _id?: ObjectId;
    technology: Technology;
    ring: string;
    voterId?: { firstName?: string; lastName?: string; nickname?: string; userId?: string; ipAddress?: string };
    eventName?: string;
    eventId?: any;
    ipAddress?: string;
    eventRound: any;
    comment?: Comment;
    tags?: string[];
}

export function countVoteComments(vote: Vote) {
    return vote.comment ? (vote.comment.replies ? countReplies(vote.comment.replies) + 1 : 1) : 0;
}
function countReplies(replies: Comment[]) {
    const flattenedComments = flattenDeepReplies(replies);
    return flattenedComments.length;
    // Alternative implementation
    // return replies.reduce(
    //     (acc, reply) => (Array.isArray(reply.replies) ? acc + 1 + countReplies(reply.replies) : acc + 1),
    //     0,
    // );
}
function flattenDeepReplies(replies: Comment[]) {
    return replies.reduce(
        (acc, reply) =>
            Array.isArray(reply.replies)
                ? acc.concat(reply).concat(flattenDeepReplies(reply.replies))
                : acc.concat(reply),
        [],
    );
}
