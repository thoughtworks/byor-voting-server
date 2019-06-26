import { inspect } from 'util';
import { pipe } from 'rxjs';
import { mergeMap, map, tap } from 'rxjs/operators';
import { Db } from 'mongodb';
import { findObs, updateOneObs } from 'observable-mongo';

import { config } from '../../api/config';
import { getMongoClient } from '../../lib/observables';
import { logObsNext, logObsError, logObsCompleted, logDebug } from '../../lib/utils';

export function up(next: (error?: any) => any) {
    getMongoClient(
        config.mongoUri,
        config.dbname,
        pipe(
            mergeMap((db: Db) =>
                findObs(db.collection(config.configurationCollection), { user: null }).pipe(
                    map(foundItem => ({ db: db, item: foundItem })),
                ),
            ),
            tap((row: { db: Db; item }) => logDebug('-->found object to migrate:\n' + JSON.stringify(row.item))),
            mergeMap((row: { db: Db; item }) =>
                updateOneObs(
                    { _id: row.item._id },
                    { 'config.bannerTargetUrl': 'https://www.thoughtworks.com/radar' },
                    row.db.collection(config.configurationCollection),
                ),
            ),
            tap(result => logDebug('getMongoClient-updateOneObs/result ->' + inspect(result))),
        ),
    ).subscribe(nextVal => logObsNext(nextVal), error => logObsError(error), () => logObsCompleted(next));
}
