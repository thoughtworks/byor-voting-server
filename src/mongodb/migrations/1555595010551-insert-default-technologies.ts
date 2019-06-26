import { inspect } from 'util';
import { pipe } from 'rxjs';
import { tap, map, mergeMap } from 'rxjs/operators';
import { Db } from 'mongodb';
import { insertOneObs } from 'observable-mongo';

import { config } from '../../api/config';
import { readCsvLineObs$, getMongoClient } from '../../lib/observables';
import { logObsCompleted, logObsError, logObsNext, logTrace, logDebug } from '../../lib/utils';

export function up(next: (error?: any) => any) {
    getMongoClient(
        config.mongoUri,
        config.dbname,
        pipe(
            mergeMap((db: Db) =>
                readCsvLineObs$(`${__dirname}/../../../data/TW_blips.csv`).pipe(
                    map(record => ({ db: db, record: record })),
                ),
            ),
            tap(item => logTrace('getMongoClient-readCsvLineObs$/record ->' + JSON.stringify(item.record))),
            mergeMap(item => insertOneObs(item.record, item.db.collection(config.technologiesCollection))),
            tap(result => logDebug('getMongoClient-readCsvLineObs$/result ->' + inspect(result))),
        ),
    ).subscribe(nextVal => logObsNext(nextVal), error => logObsError(error), () => logObsCompleted(next));
}
