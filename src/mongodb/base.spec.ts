import { connectObs, dropObs, createCollectionObs, createIndexObs } from 'observable-mongo';
import { switchMap, tap, finalize, map } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { MongoClient, Db } from 'mongodb';
import { config } from '../api/config';

export const cleanVotingEventsAndVotesCollections = (dbName: string) => {
    let mongoClient: MongoClient;
    return connectObs(config.mongoUri).pipe(
        tap(client => (mongoClient = client)),
        map(client => client.db(dbName)),
        switchMap((db: Db) => {
            return forkJoin(
                dropObs(db.collection(config.votingEventsCollection)),
                dropObs(db.collection(config.votesCollection)),
            ).pipe(map(() => db));
        }),
        switchMap((db: Db) => {
            return forkJoin(
                createCollectionObs(config.votingEventsCollection, db),
                createCollectionObs(config.votesCollection, db),
            );
        }),
        // TODO: create index should somehow come from migrations!!
        switchMap(([votingEventColl, _votesColl]) => createIndexObs({ name: 1 }, { unique: true }, votingEventColl)),
        finalize(() => mongoClient.close()),
    );
};
