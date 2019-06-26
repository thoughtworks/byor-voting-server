import { expect } from 'chai';

import { switchMap, map, toArray, tap } from 'rxjs/operators';

import { CachedDB, mongodbService } from '../api/service';
import { config } from '../api/config';
import { connectObs, dropObs, findObs } from 'observable-mongo';
import { ServiceNames } from '../service-names';

describe('Client log operations', () => {
    it('saves some data on the client log collection', done => {
        const LOG_DATA = 'I am a log';
        const REASON = 'I am the reason why this log is sent';
        const IP_ADDRESS = '111.222.333.444';

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        let _client;
        connectObs(config.mongoUri)
            .pipe(
                tap(client => (_client = client)),
                map(client => client.db(config.dbname)),
                switchMap(db => {
                    const logCollections = db.collection(config.logCollection);
                    return dropObs(logCollections).pipe(map(() => db));
                }),
                switchMap(db =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.saveLogInfo,
                        { reason: REASON, logInfo: LOG_DATA },
                        IP_ADDRESS,
                    ).pipe(map(() => db)),
                ),
                switchMap(db => {
                    const logCollections = db.collection(config.logCollection);
                    return findObs(logCollections);
                }),
                toArray(),
            )
            .subscribe(
                logEntries => {
                    expect(logEntries.length).to.be.equal(1, 'Log entries not as expected');
                    expect(logEntries[0].reason).to.be.equal(REASON, 'Reason not as expected');
                    expect(logEntries[0].logInfo).to.be.equal(LOG_DATA, 'Data not as expected');
                },
                err => {
                    cachedDb.client.close();
                    _client.close();
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    _client.close();
                    done();
                },
            );
    }).timeout(10000);
});
