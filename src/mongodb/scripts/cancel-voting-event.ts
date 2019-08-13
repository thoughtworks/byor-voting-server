import { config } from '../../api/config';
import { ObjectId } from 'mongodb';
import { cancelVotingEventVerified } from '../../api/voting-event-apis';
import { connectObs } from 'observable-mongo';
import { concatMap } from 'rxjs/operators';

export function cancelVotingEvent(eventId: ObjectId, cancelHard: boolean) {
    return connectObs(config.mongoUri).pipe(
        concatMap(client =>
            cancelVotingEventVerified(
                client.db(config.dbname).collection(config.votingEventsCollection),
                client.db(config.dbname).collection(config.votesCollection),
                eventId,
                null,
                cancelHard,
            ),
        ),
    );
}
