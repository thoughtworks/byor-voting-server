import { VotingEventFlow } from '../model/voting-event-flow';

export const CorporateVotingEventFlow: VotingEventFlow = {
    steps: [
        {
            name: 'vote all techs',
            identification: { name: 'nickname' },
            action: {
                name: 'vote',
                parameters: {
                    commentOnVoteBlocked: false,
                    allowTagsOnVote: true,
                    tags: ['Prod Experience', 'Personal Project', 'Blogs-Conferences', 'Training', 'Colleagues'],
                },
            },
        },
        {
            name: 'conversation on all techs',
            identification: { name: 'login', groups: ['architect'] },
            action: {
                name: 'conversation',
                parameters: {
                    displayVotesAndCommentNumbers: true,
                    allowTagsOnVote: true,
                    tags: ['Prod Experience', 'Personal Project', 'Blogs-Conferences', 'Training', 'Colleagues'],
                },
            },
        },
        {
            name: 'recommendations on all techs',
            identification: { name: 'login', groups: ['champion'] },
            action: { name: 'recommendation' },
        },
    ],
};
