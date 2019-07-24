import { inspect } from 'util';
import { pipe } from 'rxjs';
import { tap, concatMap, mergeMap, map } from 'rxjs/operators';
import { Db } from 'mongodb';
import { dropObs, createCollectionObs, insertOneObs } from 'observable-mongo';

import { config } from '../../api/config';
import { getMongoClient, readCsvLineObs$ } from '../../lib/observables';
import { logObsCompleted, logObsError, logObsNext, logDebug, logTrace } from '../../lib/utils';

export function up(next: (error?: any) => any) {
    let _db: Db;
    getMongoClient(
        config.mongoUri,
        config.dbname,
        pipe(
            tap(db => (_db = db)),
            concatMap(() => dropObs(_db.collection(config.twBlipsCollection))),
            concatMap(() =>
                createCollectionObs(config.twBlipsCollection, _db, { collation: { locale: 'en', strength: 2 } }),
            ),
            mergeMap(() =>
                readCsvLineObs$(`${__dirname}/../../../data/TW_blips_history.csv`).pipe(
                    map(record => ({ db: _db, record: record })),
                ),
            ),
            tap(item => logTrace('getMongoClient-readCsvLineObs$/record ->' + JSON.stringify(item.record))),
            mergeMap(item => insertOneObs(item.record, item.db.collection(config.twBlipsCollection))),
            tap(result => logDebug('create-index-tw-blips-name-case-insensitive/result ->' + inspect(result))),
        ),
    ).subscribe(nextVal => logObsNext(nextVal), error => logObsError(error), () => logObsCompleted(next));
}
