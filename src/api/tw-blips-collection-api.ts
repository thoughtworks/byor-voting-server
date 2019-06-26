import { toArray } from 'rxjs/operators';
import { Collection } from 'mongodb';

import { findObs, aggregateObs } from 'observable-mongo';

export function executeTwBlipsCollection(twBlipsCollection: Collection<any>, twLatestEdition: any) {
    return findObs(twBlipsCollection, { edition: twLatestEdition }).pipe(toArray());
}

export function findLatestEdition(twBlipsCollection: Collection<any>) {
    return aggregateObs(twBlipsCollection, [{ $sort: { edition: -1 } }, { $limit: 1 }]);
}
