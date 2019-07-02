import { VotingEventFlow } from '../model/voting-event-flow';

export const CorporateVotingEventFlow: VotingEventFlow = {
    steps: [
        {
            name: 'vote all techs',
            identification: { name: 'nickname' },
            action: { name: 'vote', commentOnVoteBlocked: false },
        },
        {
            name: 'conversation on all techs',
            identification: { name: 'login', roles: ['architect'] },
            action: { name: 'conversation' },
        },
        {
            name: 'conversation on all techs',
            identification: { name: 'login', roles: ['champion'] },
            action: { name: 'recommendation' },
        },
    ],
};
