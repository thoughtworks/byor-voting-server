import { expect } from 'chai';

import { switchMap, map } from 'rxjs/operators';

import { CachedDB, mongodbService } from '../api/service';
import { config } from '../api/config';
import { laodConfiguration } from '../api/configuration-apis';
import { connectObs } from 'observable-mongo';
import { ServiceNames } from '../service-names';

describe('Operations on Configuration collection', () => {
    it('1.0 - loads the configuration and then reads it', done => {
        const testToggle1 = false;
        const testToggle2 = true;
        const CONFIGURATION = [
            { config: { testToggle1, testToggle2 } },
            { user: 'ENRICO', config: { testToggle1: true } },
        ];
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        let _client;
        connectObs(config.mongoUri)
            .pipe(
                map(client => {
                    _client = client;
                    return client.db(config.dbname).collection(config.configurationCollection);
                }),
                switchMap(collection => laodConfiguration(collection, CONFIGURATION)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getConfiguration)),
            )
            .subscribe(
                configuration => {
                    expect(configuration.testToggle1).to.equal(testToggle1);
                    expect(configuration.testToggle2).to.equal(testToggle2);
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

    it('1.1 - reads the config for a user', done => {
        const testToggle1 = false;
        const testToggle2 = true;
        const CONFIGURATION = [
            { config: { testToggle1, testToggle2 } },
            { user: 'cde', config: { testToggle1: true } },
        ];
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        let _client;
        connectObs(config.mongoUri)
            .pipe(
                map(client => {
                    _client = client;
                    return client.db(config.dbname).collection(config.configurationCollection);
                }),
                switchMap(collection => laodConfiguration(collection, CONFIGURATION)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getConfiguration, { user: 'cde' })),
            )
            .subscribe(
                configuration => {
                    expect(configuration.testToggle1).to.be.true;
                    expect(configuration.testToggle2).to.equal(testToggle2);
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
