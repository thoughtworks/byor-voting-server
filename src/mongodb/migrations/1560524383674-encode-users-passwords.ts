import { logObsNext, logObsError, logObsCompleted } from '../../lib/utils';
import { getPasswordHash$, getMongoClient } from '../../lib/observables';
import { mergeMap, map } from 'rxjs/operators';
import { config } from '../../api/config';
import { pipe } from 'rxjs';
import { findObs, updateOneObs } from 'observable-mongo';
import { Db } from 'mongodb';

export function up(next: (error?: any) => any) {
    getMongoClient(
        config.mongoUri,
        config.dbname,
        pipe(
            mergeMap((db: Db) =>
                findObs(db.collection(config.usersCollection), {}).pipe(
                    map(foundUser => ({ db: db, foundUser: foundUser })),
                ),
            ),
            mergeMap(item =>
                getPasswordHash$(item.foundUser.pwd).pipe(
                    map(hash => {
                        item.foundUser.pwd = hash;
                        return item;
                    }),
                ),
            ),
            mergeMap((item: { db: Db; foundUser }) =>
                updateOneObs(
                    { _id: item.foundUser._id },
                    { pwd: item.foundUser.pwd },
                    item.db.collection(config.usersCollection),
                ),
            ),
        ),
    ).subscribe(nextVal => logObsNext(nextVal), error => logObsError(error), () => logObsCompleted(next));
}
