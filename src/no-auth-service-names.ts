import { ServiceNames } from './service-names';

export function noAuthServiceNames() {
    return [
        ServiceNames[ServiceNames.getVotingEvents],
        ServiceNames[ServiceNames.hasAlreadyVoted],
        ServiceNames[ServiceNames.getVotingEvent],
        ServiceNames[ServiceNames.getConfiguration],
        ServiceNames[ServiceNames.getVotes],
        ServiceNames[ServiceNames.saveVotes],
        ServiceNames[ServiceNames.addNewTechnologyToEvent],
        ServiceNames[ServiceNames.calculateBlipsFromAllEvents],
        ServiceNames[ServiceNames.calculateBlips],
        ServiceNames[ServiceNames.alive],
        ServiceNames[ServiceNames.addReplyToVoteComment],
        ServiceNames[ServiceNames.authenticate],
        ServiceNames[ServiceNames.noservice],
        ServiceNames[ServiceNames.version],
        ServiceNames[ServiceNames.saveLogInfo],
        ServiceNames[ServiceNames.getBlipHistoryForTech],
    ];
}
