import { Technology } from './technology';

export type VotingEventStatus = 'open' | 'closed';

export interface VotingEvent {
    _id?: any;
    name: string;
    status: VotingEventStatus;
    creationTS: string;
    lastOpenedTS?: string;
    lastClosedTS?: string;
    technologies?: Technology[];
    round?: number;
    openForRevote?: boolean;
    hasTechnologiesForRevote?: boolean;
    url?: string;
}
