import { VotingEventFlow } from '../model/voting-event-flow';

export const CommunityVotingEventFlow: VotingEventFlow = {
    steps: [
        {
            name: 'vote all techs',
            identification: { name: 'nickname' },
            action: { name: 'vote', commentOnVoteBlocked: false },
        },
        {
            name: 'conversation phase on blips uncertain',
            identification: { name: 'nickname' },
            action: { name: 'conversation', techSelectLogic: 'TechUncertain' },
        },
        {
            name: 'revote techs with uncertain blips',
            identification: { name: 'nickname' },
            action: { name: 'vote', commentOnVoteBlocked: true, techSelectLogic: 'TechUncertain' },
        },
    ],
};
