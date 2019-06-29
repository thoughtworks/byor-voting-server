import { ObjectId } from 'mongodb';
import { Comment } from './comment';

export interface Technology {
    _id?: string | ObjectId;
    name: string;
    quadrant: string;
    isNew: boolean;
    description: string;
    forRevote?: boolean;
    comments?: Comment[];
}
