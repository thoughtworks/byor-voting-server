import { VotingEventFlow } from '../model/voting-event-flow';

export const CORPORATE_VOTING_EVENT_TAGS = [
    'Prod Experience',
    'Personal Project',
    'Blogs-Conferences',
    'Training',
    'Colleagues',
];

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
                    tags: CORPORATE_VOTING_EVENT_TAGS,
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
                    tags: CORPORATE_VOTING_EVENT_TAGS,
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
