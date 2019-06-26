import { pipe } from 'rxjs';
import { mergeMap, map, tap } from 'rxjs/operators';
import { Db, ObjectID } from 'mongodb';
import { findObs, updateOneObs } from 'observable-mongo';
import { inspect } from 'util';

import { config } from '../api/config';
import { getMongoClient } from './observables';
import { logDebug } from './utils';

export const findAndUpdateDoc$ = (
    collection: string,
    findCriteria: any,
    updateValuesF: { (item: { db: Db; values: any }): any },
) => {
    return getMongoClient(
        config.mongoUri,
        config.dbname,
        pipe(
            mergeMap((db: Db) =>
                findObs(db.collection(collection), findCriteria).pipe(
                    map(foundItem => ({ db: db, values: foundItem })),
                ),
            ),
            tap((foundItem: { db: Db; values }) =>
                logDebug('-->found object to update:\n' + JSON.stringify(foundItem.values)),
            ),
            mergeMap((foundItem: { db: Db; values }) =>
                updateOneObs(
                    { _id: new ObjectID(foundItem.values._id) },
                    updateValuesF(foundItem.values),
                    foundItem.db.collection(collection),
                ),
            ),
            tap(result => logDebug('getMongoClient-updateOneObs/result ->' + inspect(result))),
        ),
    );
};
