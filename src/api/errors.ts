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
    },
    techPresentInVotingEvent: {
        errorCode: 'V-E-03',
        message: `the technology is already present in the voting event`,
    },
    techNotPresentInVotingEvent: {
        errorCode: 'V-E-04',
        message: `the technology is NOT present in the voting event`,
    },
    voteAlreadyPresent: { errorCode: 'V-01', mongoErrorCode: 11000, message: `vote already present` } as MongoError,
    pwdInvalid: { errorCode: 'A-01', message: `password not valid` },
    userUnknown: { errorCode: 'A-02', message: `user not known` },
    userWithNotTheRequestedRole: { errorCode: 'A-03', message: `user does not have the requesated role` },
    technologyAlreadyPresent: {
        errorCode: 'V-T-01',
        mongoErrorCode: 11000,
        message: `Technology already present`,
    } as MongoError,
};
