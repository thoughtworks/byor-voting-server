import { toArray, map } from 'rxjs/operators';
import { Collection } from 'mongodb';

import { findObs, aggregateObs } from 'observable-mongo';

export function executeTwBlipsCollection(twBlipsCollection: Collection<any>, twLatestEdition: any) {
    return findObs(twBlipsCollection, { edition: twLatestEdition }).pipe(toArray());
}

export function findLatestEdition(twBlipsCollection: Collection<any>) {
    return aggregateObs(twBlipsCollection, [{ $sort: { edition: -1 } }, { $limit: 1 }]);
}

export function getBlipHistoryForTech(twBlipsCollection: Collection<any>, params: { techName: string }) {
    return findObs(twBlipsCollection, { name: params.techName }).pipe(
        toArray(),
        map(blips => blips.sort((a, b) => (a.edition < b.edition ? 1 : -1))),
    );
}
