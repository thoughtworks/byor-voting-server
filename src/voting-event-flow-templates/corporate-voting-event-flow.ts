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
            identification: { name: 'login', groups: ['architect'] },
            action: { name: 'conversation' },
        },
        {
            name: 'conversation on all techs',
            identification: { name: 'login', groups: ['champion'] },
            action: { name: 'recommendation' },
        },
    ],
};
