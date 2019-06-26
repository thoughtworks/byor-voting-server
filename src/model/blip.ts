import { AggregatedVoteForRing } from './aggregated-vote';

export interface Blip {
    name: string;
    ring: string;
    quadrant: string;
    isNew: boolean;
    description: string;
    number?: number;
    votes?: AggregatedVoteForRing[];
    forRevote?: boolean;
    numberOfVotes?: number;
}
