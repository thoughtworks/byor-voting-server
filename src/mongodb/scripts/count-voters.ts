import { switchMap, map, finalize, mergeMap, filter } from 'rxjs/operators';
import { MongoClient, Collection } from 'mongodb';
import { connectObs, distinctObs, findObs } from 'observable-mongo';
import { config } from '../../api/config';
import { VotingEvent } from '../../model/voting-event';
import { Observable } from 'rxjs';
import { logTrace, logError } from '../../lib/utils';
import { inspect } from 'util';

export function countVoters(eventId?: string): Observable<any> {
    let connectedClient: MongoClient;
    let votesCollection: Collection;
    let votingEventsCollection: Collection;
    return connectObs(config.mongoUri).pipe(
        map(client => {
            connectedClient = client;
            const db = client.db(config.dbname);
            votesCollection = db.collection(config.votesCollection);
            votingEventsCollection = db.collection(config.votingEventsCollection);
            return db;
        }),
        switchMap(() => {
            return findObs(votingEventsCollection) as Observable<VotingEvent>;
        }),
        filter(votingEvent => (eventId ? votingEvent._id.toHexString() === eventId : true)),
        mergeMap(votingEvent =>
            distinctObs(votesCollection, 'voterId', { eventId: votingEvent._id.toHexString() }).pipe(
                map(voters => ({ numberOfVoters: voters.length, votingEvent: votingEvent.name })),
            ),
        ),
        finalize(() =>
            connectedClient
                .close()
                .then(
                    () => logTrace('Connection closed for count voters'),
                    err => logError('Error while closing the connection:' + inspect(err)),
                ),
        ),
    );
}
