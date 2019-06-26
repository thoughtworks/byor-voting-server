import { getMongoClient } from '../../lib/observables';
import { config } from '../../api/config';
import { pipe } from 'rxjs';
import { mergeMap, tap } from 'rxjs/operators';
import { Db } from 'mongodb';
import { logObsNext, logObsError, logObsCompleted, logDebug } from '../../lib/utils';
import { inspect } from 'util';
import { updateOneObs } from 'observable-mongo';

export function up(next: (error?: any) => any) {
    getMongoClient(
        config.mongoUri,
        config.dbname,
        pipe(
            mergeMap((db: Db) =>
                updateOneObs(
                    { user: { $exists: false } },
                    { 'config.hideVoteComment': false },
                    db.collection(config.configurationCollection),
                    { upsert: true },
                ),
            ),
            tap(result => logDebug('getMongoClient-updateOneObs/result ->' + inspect(result))),
        ),
    ).subscribe(nextVal => logObsNext(nextVal), error => logObsError(error), () => logObsCompleted(next));
}
