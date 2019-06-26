import { inspect } from 'util';
import { pipe } from 'rxjs';
import { tap, map, mergeMap } from 'rxjs/operators';
import { Db } from 'mongodb';
import { insertOneObs } from 'observable-mongo';

import { config } from '../../api/config';
import { readCsvLineObs$, getMongoClient } from '../../lib/observables';
import { logObsNext, logObsError, logObsCompleted, logTrace, logDebug } from '../../lib/utils';

export function up(next: (error?: any) => any) {
    getMongoClient(
        config.mongoUri,
        config.dbname,
        pipe(
            mergeMap((db: Db) =>
                readCsvLineObs$(`${__dirname}/../../../data/TW_blips_history.csv`).pipe(
                    map(record => ({ db: db, record: record })),
                ),
            ),
            tap(item => logTrace('getMongoClient-readCsvLineObs$/record ->' + JSON.stringify(item.record))),
            mergeMap(item => insertOneObs(item.record, item.db.collection(config.twBlipsCollection))),
            tap(result => logDebug('getMongoClient-readCsvLineObs$/result ->' + inspect(result))),
        ),
    ).subscribe(nextVal => logObsNext(nextVal), error => logObsError(error), () => logObsCompleted(next));
}
