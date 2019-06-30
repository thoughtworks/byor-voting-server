import { VotingEventFlow } from '../model/voting-event-flow';

export const CorporateVotingEventFlow: VotingEventFlow = {
    steps: [
        { identification: { name: 'nickname' }, action: { name: 'vote', commentOnVoteBlocked: true } },
        { identification: { name: 'login', role: 'architect' }, action: { name: 'conversation' } },
        { identification: { name: 'login', role: 'champion' }, action: { name: 'recommendation' } },
    ],
};
