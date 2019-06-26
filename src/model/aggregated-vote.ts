export interface AggregatedVoteForRing {
    ring: string;
    count: number; // number of votes got by a certain ring on a certain Technology and Ring
    votesForEvent: {
        id: string;
        eventName: string;
        count: number; // number of votes got by a certain ring on a certain Technology, Ring and Event
    }[];
}
export interface AggregatedVote {
    technology: string;
    quadrant: string;
    isNew: boolean;
    count: number; // number of votes got by a certain ring on a certain Technology
    votesForRing: AggregatedVoteForRing[];
}
