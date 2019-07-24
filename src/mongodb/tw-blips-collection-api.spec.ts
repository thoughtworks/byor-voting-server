import { expect } from 'chai';
import { tap } from 'rxjs/operators';
import { mongodbService, CachedDB } from '../api/service';
import { config } from '../api/config';
import { ServiceNames } from '../service-names';

describe('Operations on tw-blips collection', () => {
    it('1.0 read a blip for a certain technology', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        mongodbService(cachedDb, ServiceNames.getBlipHistoryForTech, { techName: 'Event Storming' })
            .pipe(
                tap(result => {
                    expect(result.length).to.equal(3);
                }),
            )
            .subscribe(
                null,
                err => {
                    cachedDb.client.close();
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('1.1 read a blip for a certain technology with the name with the wrong case', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        mongodbService(cachedDb, ServiceNames.getBlipHistoryForTech, { techName: 'EVENT Storming' })
            .pipe(
                tap(result => {
                    expect(result.length).to.equal(3);
                }),
            )
            .subscribe(
                null,
                err => {
                    cachedDb.client.close();
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);
});
