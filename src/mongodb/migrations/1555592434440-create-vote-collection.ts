import { inspect } from 'util';
import { pipe } from 'rxjs';
import { mergeMap, tap } from 'rxjs/operators';
import { Db } from 'mongodb';
import { createCollectionObs } from 'observable-mongo';

import { config } from '../../api/config';
import { getMongoClient } from '../../lib/observables';
import { logObsCompleted, logObsError, logObsNext, logDebug } from '../../lib/utils';

export function up(next: (error?: any) => any) {
    getMongoClient(
        config.mongoUri,
        config.dbname,
        pipe(
            mergeMap((db: Db) => createCollectionObs(config.votesCollection, db)),
            tap(result => logDebug('getMongoClient-createCollectionObs/result ->' + inspect(result))),
        ),
    ).subscribe(nextVal => logObsNext(nextVal), error => logObsError(error), () => logObsCompleted(next));
}
