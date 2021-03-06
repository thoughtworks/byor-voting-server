import { ObjectId } from 'mongodb';
import { Comment } from './comment';

export interface VotingResults {
    votesForRing: {
        ring: string;
        count: number; // number of votes got by a certain ring on a certain Technology and Ring
    }[];
    votesForTag?: {
        tag: string;
        count: number; // number of votes which have a certain tag
    }[];
}

export interface Recommendation {
    author: string;
    ring?: string;
    text?: string;
    timestamp?: string;
}

export interface Technology {
    _id?: string | ObjectId;
    name: string;
    quadrant: string;
    isNew: boolean;
    description: string;
    forRevote?: boolean;
    comments?: Comment[];
    numberOfVotes?: number;
    numberOfComments?: number;
    votingResult?: VotingResults;
    recommender?: string;
    recommendation?: Recommendation;
}
