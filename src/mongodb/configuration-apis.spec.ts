import { expect } from 'chai';

import { switchMap, concatMap, tap, toArray } from 'rxjs/operators';

import { CachedDB, mongodbService } from '../api/service';
import { config } from '../api/config';
import { laodConfiguration } from '../api/configuration-apis';
import { connectObs, findObs } from 'observable-mongo';
import { ServiceNames } from '../service-names';
import { Collection } from 'mongodb';

describe.only('Operations on Configuration collection', () => {
    it('1.0 - loads the configuration and then reads it - at the end restores the original configuration', done => {
        const testToggle1 = false;
        const testToggle2 = true;
        const CONFIGURATION = [
            { config: { testToggle1, testToggle2 } },
            { user: 'ENRICO', config: { testToggle1: true } },
        ];
        let _originalConfiguration: any[];
        let _configurationCollection: Collection<any>;
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        let _client;
        connectObs(config.mongoUri)
            .pipe(
                tap(client => {
                    _client = client;
                    _configurationCollection = client.db(config.dbname).collection(config.configurationCollection);
                }),
                concatMap(() => findObs(_configurationCollection)),
                toArray(),
                tap(config => {
                    _originalConfiguration = config;
                }),
                concatMap(() => laodConfiguration(_configurationCollection, CONFIGURATION)),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getConfiguration)),
                tap(configuration => {
                    expect(configuration.testToggle1).to.equal(testToggle1);
                    expect(configuration.testToggle2).to.equal(testToggle2);
                }),
                concatMap(() => laodConfiguration(_configurationCollection, _originalConfiguration)),
            )
            .subscribe(
                null,
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
        let _originalConfiguration: any[];
        let _configurationCollection: Collection<any>;
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        let _client;
        connectObs(config.mongoUri)
            .pipe(
                tap(client => {
                    _client = client;
                    _configurationCollection = client.db(config.dbname).collection(config.configurationCollection);
                }),
                concatMap(() => findObs(_configurationCollection)),
                toArray(),
                tap(config => {
                    _originalConfiguration = config;
                }),
                switchMap(() => laodConfiguration(_configurationCollection, CONFIGURATION)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getConfiguration, { user: 'cde' })),
                tap(configuration => {
                    expect(configuration.testToggle1).to.be.true;
                    expect(configuration.testToggle2).to.equal(testToggle2);
                }),
                concatMap(() => laodConfiguration(_configurationCollection, _originalConfiguration)),
            )
            .subscribe(
                null,
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
