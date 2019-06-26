import { Technology } from './technology';
import { Comment } from './comment';
import { ObjectId } from 'mongodb';

export interface Vote {
    _id?: ObjectId;
    technology: Technology;
    ring: string;
    voterId?: { firstName?: string; lastName?: string; ipAddress?: string };
    eventName?: string;
    eventId?: any;
    ipAddress?: string;
    eventRound: any;
    comment?: Comment;
}
