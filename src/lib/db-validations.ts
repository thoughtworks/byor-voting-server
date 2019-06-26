import { inspect } from 'util';
import { pipe } from 'rxjs';
import { tap, map, mergeMap, filter, count } from 'rxjs/operators';
import { Db } from 'mongodb';
import { updateOneObs, aggregateObs } from 'observable-mongo';
import * as _ from 'underscore';

import { config } from '../api/config';
import { getMongoClient } from './observables';
import { logInfo, logTrace, logDebug } from './utils';

export const mongoNestedFilter = (field: string, refereceValues: string[], nestedArrays: string[]) => {
    let filter = [];
    if (nestedArrays.length == 0) {
        filter.push({ $project: { _id: 1, value: field } });
    } else {
        let parents = [];
        nestedArrays.forEach(arrayName => {
            const parentPath = parents.length == 0 ? '' : parents.join('.') + '.';
            let project = { _id: 1, [parentPath + arrayName]: 1 };
            parents.forEach(parent => {
                project[parent + 'Index'] = 1;
            });
            filter.push(
                { $project: project },
                {
                    $unwind: {
                        path: '$' + parentPath + arrayName,
                        includeArrayIndex: arrayName + 'Index',
                        preserveNullAndEmptyArrays: false,
                    },
                },
            );
            parents.push(arrayName);
        });
        let project = { _id: 1, value: field };
        parents.forEach(parent => {
            project[parent + 'Index'] = 1;
        });
        filter.push({ $project: project });
    }
    filter.push({ $match: { value: { $not: { $in: refereceValues } } } });
    return filter;
};

export const correctedValue = (invalidValue: string, refereceValues: string[]) => {
    return (
        _.chain(refereceValues)
            .select(refValue => refValue.toLowerCase() == (invalidValue || '').toLowerCase())
            .first()
            .value() || invalidValue
    );
};

export const performValidationFrom$ = (params: {
    message: string;
    collection: string;
    refereceValues: string[];
    mongoFilterParams: { field: string; nestedArrays?: string[] };
    updateFieldsF: { (foundItem: { db: Db; values: any }): any };
    fixWrongValues: boolean;
    stopOnUnfixableValues: boolean;
}) => {
    const mongoFilter = mongoNestedFilter(
        params.mongoFilterParams.field,
        params.refereceValues,
        params.mongoFilterParams.nestedArrays || [],
    );
    return performValidation$(
        params.message,
        params.collection,
        params.refereceValues,
        mongoFilter,
        params.updateFieldsF,
        params.fixWrongValues,
        params.stopOnUnfixableValues,
    );
};

export const findWrongValues$ = (
    message: string,
    collection: string,
    refereceValues: string[],
    mongoFilter: any,
    stopOnUnfixableValues: boolean,
) => {
    return getMongoClient(
        config.mongoUri,
        config.dbname,
        pipe(
            tap(() => logInfo('validating ' + message)),
            tap(() => logTrace('searching for:  ' + JSON.stringify(mongoFilter, null, 2))),
            mergeMap((db: Db) =>
                aggregateObs(db.collection(collection), mongoFilter).pipe(
                    map(foundItem => ({
                        db: db,
                        values: { ...foundItem, newValue: correctedValue(foundItem.value, refereceValues) },
                    })),
                ),
            ),
            filter((foundItem: { db: Db; values: any }) =>
                stopOnUnfixableValues
                    ? foundItem.values.value === foundItem.values.newValue
                    : foundItem.values.value != foundItem.values.newValue,
            ),
        ),
    );
};

export const performValidation$ = (
    message: string,
    collection: string,
    refereceValues: string[],
    mongoFilter: any,
    updateFieldsF: { (foundItem: { db: Db; values: any }): any },
    fixWrongValues: boolean,
    stopOnUnfixableValues: boolean,
) => {
    const findInvalidValues$ = findWrongValues$(
        message,
        collection,
        refereceValues,
        mongoFilter,
        stopOnUnfixableValues,
    );
    if (stopOnUnfixableValues)
        return findInvalidValues$.pipe(
            tap((foundItem: { db: Db; values: any }) =>
                logInfo('found invalid value: ' + JSON.stringify(foundItem.values)),
            ),
            count(),
            tap(n => logInfo(n + ' unfixable value(s)!')),
            tap(n => {
                if (n > 0) throw new Error('found ' + n + ' unfixable value(s)!');
            }),
        );
    if (fixWrongValues)
        return findInvalidValues$.pipe(
            tap((foundItem: { db: Db; values: any }) =>
                logDebug('found invalid value: ' + JSON.stringify(foundItem.values)),
            ),
            mergeMap((foundItem: { db: Db; values: any }) =>
                updateOneObs(
                    { _id: foundItem.values._id },
                    updateFieldsF(foundItem),
                    foundItem.db.collection(collection),
                ),
            ),
            tap(commandResult => logDebug('result ->' + inspect(commandResult.result))),
            count(),
            tap(n => logInfo(n + ' value(s) fixed!')),
        );
    return findInvalidValues$.pipe(
        tap((foundItem: { db: Db; values: any }) =>
            logInfo('found invalid value: ' + JSON.stringify(foundItem.values)),
        ),
        count(),
        tap(n => logInfo('found ' + n + ' fixable value(s)!')),
    );
};
