import { inspect } from 'util';
import { pipe } from 'rxjs';
import { mergeMap, tap } from 'rxjs/operators';
import { Db } from 'mongodb';
import { insertManyObs } from 'observable-mongo';

import { config } from '../../api/config';
import { getMongoClient } from '../../lib/observables';
import { logObsCompleted, logObsError, logObsNext, logDebug } from '../../lib/utils';

export function up(next: (error?: any) => any) {
    getMongoClient(
        config.mongoUri,
        config.dbname,
        pipe(
            mergeMap((db: Db) =>
                insertManyObs(
                    [
                        { config: { revoteToggle: false, thresholdForRevote: 20, secondValue: 'second' } },
                        { user: 'abc', config: { revoteToggle: true, allVotesToggle: true, thirdValue: 'third' } },
                    ],
                    db.collection(config.configurationCollection),
                ),
            ),
            tap(result => logDebug('getMongoClient-insertManyObs/result ->' + inspect(result))),
        ),
    ).subscribe(nextVal => logObsNext(nextVal), error => logObsError(error), () => logObsCompleted(next));
}
