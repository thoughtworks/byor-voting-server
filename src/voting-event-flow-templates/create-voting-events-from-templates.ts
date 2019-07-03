import { concatMap, tap, map, finalize } from 'rxjs/operators';
import { mongodbService, CachedDB } from '../api/service';
import { config } from '../api/config';
import { MongoClient } from 'mongodb';
import { connectObs } from 'observable-mongo';
import { ServiceNames } from '../service-names';
import { logError } from '../lib/utils';
import { VotingEvent } from '../model/voting-event';
import { CorporateVotingEventFlow } from './corporate-voting-event-flow';
import { CommunityVotingEventFlow } from './community-voting-event-flow';

const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

const corporateEvent: VotingEvent = { name: 'A Corporate Event', flow: CorporateVotingEventFlow };
const communityEvent: VotingEvent = { name: 'A Community Event', flow: CommunityVotingEventFlow };

const initialize = (dbName: string) => {
    let mongoClient: MongoClient;
    return connectObs(config.mongoUri).pipe(
        tap(client => (mongoClient = client)),
        map(client => client.db(dbName)),
        finalize(() => mongoClient.close()),
    );
};

initialize(cachedDb.dbName)
    .pipe(
        concatMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, corporateEvent)),
        concatMap(_id => mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id })),
        concatMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, communityEvent)),
        concatMap(_id => mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id })),
    )
    .subscribe(
        null,
        err => {
            cachedDb.client.close();
            logError(err);
        },
        () => {
            cachedDb.client.close();
        },
    );
