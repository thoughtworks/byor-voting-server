import { throwError, merge } from 'rxjs';
import { toArray, switchMap, map, catchError, filter, share } from 'rxjs/operators';
import { Collection } from 'mongodb';

import { findObs, dropObs, insertOneObs, updateOneObs, deleteObs } from 'observable-mongo';
import { ERRORS } from './errors';
import { Technology } from '../model/technology';
import { getObjectId } from './utils';

export function getTechnologies(technologiesColl: Collection, options?: { readAll: boolean }) {
    const selector =
        !options || !options.readAll ? { $or: [{ cancelled: { $exists: false } }, { cancelled: false }] } : {};
    return findObs(technologiesColl, selector).pipe(
        toArray(),
        map(technologies => technologies.sort((a, b) => a.sequence - b.sequence)),
        map(technologies => ({ technologies })),
    );
}
export function laodTechnologies(technologiesColl: Collection, technologies) {
    return dropObs(technologiesColl).pipe(
        switchMap(() => technologiesColl.insertMany(technologies)),
        map(result => ({ result })),
    );
}
export function deleteTechnologies(technologiesColl: Collection) {
    return dropObs(technologiesColl).pipe(map(result => ({ result })));
}

export function getTechnology(technologiesColl: Collection, serviceData: { name: string }) {
    const selector = { $or: [{ cancelled: { $exists: false } }, { cancelled: false }], name: serviceData.name };
    return findObs(technologiesColl, selector).pipe(
        // not using take(1) because I want to return null if no technology is found
        toArray(),
        map((technologies: Technology[]) => {
            return technologies.length > 0 ? technologies[0] : null;
        }),
    );
}
// @todo this function can be simplified if we set a unique index on name property of the Technologies collection
export function addTechnology(technologiesColl: Collection, serviceData: { technology: Technology }) {
    const getTech = getTechnology(technologiesColl, { name: serviceData.technology.name }).pipe(
        // share is needed so that the 2 Observables that we create later in the method both share the same read operation
        share(),
    );
    const techNotExisting = getTech.pipe(
        filter(tech => tech === null),
        switchMap(() => insertOneObs(serviceData.technology, technologiesColl)),
        catchError(err => {
            if (err.code === ERRORS.votingEventAlreadyPresent.mongoErrorCode) {
                return throwError(ERRORS.technologyAlreadyPresent);
            } else {
                return throwError(err);
            }
        }),
    );
    const techAlreadyExisting = getTech.pipe(
        filter(tech => tech !== null),
        switchMap(() => throwError(ERRORS.technologyAlreadyPresent)),
    );
    return merge(techNotExisting, techAlreadyExisting);
}
export function updateTechnology(technologiesColl: Collection, serviceData: { technology: Technology }) {
    const _id = serviceData.technology._id;
    const dataToUpdate = { ...serviceData.technology, lastUpdatedTS: new Date(Date.now()).toISOString() };
    delete dataToUpdate._id;
    return _updateTech(technologiesColl, _id, dataToUpdate);
}
export function cancelTechnology(technologiesColl: Collection, serviceData: { id: any }) {
    const dataToUpdate = { cancelled: true, cancelledTS: new Date(Date.now()).toISOString() };
    return _updateTech(technologiesColl, serviceData.id, dataToUpdate);
}
export function restoreTechnology(technologiesColl: Collection, serviceData: { id: any }) {
    const dataToUpdate = { cancelled: false, restoredTS: new Date(Date.now()).toISOString() };
    return _updateTech(technologiesColl, serviceData.id, dataToUpdate);
}
export function deleteTechnology(technologiesColl: Collection, serviceData: { _id: any }) {
    const filter = { _id: getObjectId(serviceData._id) };
    return deleteObs(filter, technologiesColl);
}
function _updateTech(technologiesColl: Collection, id: any, dataToUpdate: any) {
    const filter = { _id: getObjectId(id) };
    return updateOneObs(filter, dataToUpdate, technologiesColl);
}
