export interface MongoError {
    errorCode: string;
    mongoErrorCode: number;
    message: string;
}

export const ERRORS = {
    votingEventAlreadyPresent: {
        errorCode: 'V-E-01',
        mongoErrorCode: 11000,
        message: `voting event already present`,
    } as MongoError,
    votingEventNotExisting: {
        errorCode: 'V-E-02',
        message: `voting event does not exist`,
        votingEventId: null,
    },
    techPresentInVotingEvent: {
        errorCode: 'V-E-03',
        message: `the technology is already present in the voting event`,
    },
    techNotPresentInVotingEvent: {
        errorCode: 'V-E-04',
        message: `the technology is NOT present in the voting event`,
    },
    votingEventCanNotMoveToPreviousStepBecauseAlreadyInTheFirstStep: {
        errorCode: 'V-E-05',
        message: `Voting Event already in the first step`,
    },
    votingEventCanNotMoveToNextStepBecauseAlreadyInTheLastStep: {
        errorCode: 'V-E-06',
        message: `Voting Event already in the last step`,
    },
    voteAlreadyPresent: { errorCode: 'V-01', mongoErrorCode: 11000, message: `vote already present` } as MongoError,
    pwdInvalid: { errorCode: 'A-01', message: `password not valid` },
    userUnknown: { errorCode: 'A-02', message: `user not known`, userId: null },
    userWithNotTheRequestedRole: { errorCode: 'A-03', message: `user does not have the requested role`, user: null },
    userWithNotTheRequestedGroup: { errorCode: 'A-04', message: `user does not have the requested Group` },
    noUserProvidedForAuthorization: { errorCode: 'A-05', message: `no user has been provide for authorization` },
    technologyAlreadyPresent: {
        errorCode: 'V-T-01',
        mongoErrorCode: 11000,
        message: `Technology already present`,
    } as MongoError,
    recommendationAuthorAlreadySet: { errorCode: 'R-01', message: `Recommender already set`, currentAuthor: null },
    recommendationAuthorDifferent: {
        errorCode: 'R-02',
        message: `Who is requesting the reset of recommendation 
    is not the person who actually is the recommender`,
        currentAuthor: null,
    },
    initiativeAlreadyPresent: {
        errorCode: 'I-01',
        mongoErrorCode: 11000,
        message: `Initiative already present`,
    } as MongoError,
};
