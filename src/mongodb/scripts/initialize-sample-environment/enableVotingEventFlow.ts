import { updateOneObs, connectObs } from 'observable-mongo';

import { CachedDB } from '../../../api/service';
import { config } from '../../../api/config';
import { tap, concatMap } from 'rxjs/operators';

const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

export function enableVotingEventFlow() {
    return updateOneObs(
        { user: { $exists: false } },
        { 'config.enableVotingEventFlow': true },
        cachedDb.db.collection(config.configurationCollection),
        { upsert: true },
    );
}

// execute the function

const initializeConn = (dbName: string) => {
    return connectObs(config.mongoUri).pipe(
        tap(_client => (cachedDb.client = _client)),
        tap(_client => (cachedDb.db = _client.db(dbName))),
    );
};

initializeConn(cachedDb.dbName)
    .pipe(concatMap(() => enableVotingEventFlow()))
    .subscribe(
        null,
        err => {
            cachedDb.client.close();
            console.error(err);
        },
        () => {
            cachedDb.client.close();
            console.log('DONE');
        },
    );
