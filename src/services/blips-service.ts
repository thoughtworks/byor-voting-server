import { CachedDB, mongodbService, mongodbServiceForTWBlips } from '../api/service';
import { ServiceNames } from '../service-names';
import { pick, isEmpty, sortBy, groupBy, uniq, map as lodashMap, difference, flatMap, find } from 'lodash';
import { map, switchMap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { logError } from '../lib/utils';

const quadrantsOrder = ['Tools', 'Techniques', 'Platforms', 'Languages & Frameworks'];
const quadrantOrderUpperCase = quadrantsOrder.map(q => q.toUpperCase());
const ringsOrder = ['Adopt', 'Trial', 'Assess', 'Hold'];

export function sortByQuadrants(blips: any[]): any[] {
    const rankRings = { Adopt: 1, Trial: 2, Assess: 3, Hold: 4 };
    const quadrants = groupBy(blips, 'quadrant');

    // this block of code deals with the situation where the names of the quadrants are not precisely those of the
    // official tech radar, e.g. in the case of the radard for designers
    const quadrantKeys = Object.keys(quadrants);
    const quadrantKeysUppercase = Object.keys(quadrants).map(k => k.toUpperCase());
    const newQuadrantOrderWithHoles = quadrantOrderUpperCase.map(q =>
        quadrantKeysUppercase.includes(q) ? quadrantKeys.find(qk => qk.toUpperCase() === q) : null,
    );
    const missingQuadrants = quadrantKeys.filter(qk => !quadrantOrderUpperCase.includes(qk.toUpperCase()));
    let i = 0;
    const newQuadrantOrder = newQuadrantOrderWithHoles.map(q => {
        let ret = q;
        if (!q) {
            ret = missingQuadrants[i];
            i++;
        }
        return ret;
    });
    // end of the block

    return flatMap(newQuadrantOrder, quadrant => {
        let allBlipsSortedByVotes = sortBy(quadrants[quadrant], 'votes')
            .reverse()
            .slice(0, 50);
        return sortBy(allBlipsSortedByVotes, blip => rankRings[blip.ring]);
    });
}

export function fillMissingBlips(blips: any[]): any[] {
    fillMissingQuadrants(blips);
    fillMissingRingsForAtLeastOneQuadrant(blips);
    return blips;
}

function addTwBlipDescription(cachedDb: CachedDB, blips: any[]) {
    return mongodbServiceForTWBlips(cachedDb, {}).pipe(
        map(twBlips => {
            return blips.map(blip => {
                let twBlip = find(twBlips, { name: blip.name });
                if (twBlip) {
                    blip.description =
                        blip.description +
                        '<br><br><b>TW Tech Radar</b> ' +
                        twBlip['ring'] +
                        ' ' +
                        (twBlip['edition'] || '') +
                        (twBlip['description'] || '').replace(/"/g, "'");
                    blip.name = blip.name + '(*)';
                }
                return blip;
            });
        }),
    );
}

export function getBlips(cachedDb: CachedDB, service: ServiceNames, params: any, ipAddress: string) {
    return mongodbService(cachedDb, service, params, ipAddress).pipe(
        switchMap(serviceResult => {
            let blipsWithAllQuadrants = fillMissingBlips(serviceResult);
            let result = sortByQuadrants(blipsWithAllQuadrants);
            return addTwBlipDescription(cachedDb, result);
        }),
        map(result => {
            return formatCsvData(result);
        }),
        catchError(err => {
            const errorMessage = 'Error while fetching blips for event' + ServiceNames[service];
            logError(errorMessage + '\n' + err);
            return throwError(errorMessage);
        }),
    );
}

export function getBlipsForReVote(cachedDb: CachedDB, service: ServiceNames, params: any, ipAddress: string) {
    return mongodbService(cachedDb, service, params, ipAddress).pipe(
        switchMap(serviceResult => {
            let result = filterBlipsForReVote(serviceResult);
            return addTwBlipDescription(cachedDb, result);
        }),
        map(result => {
            return formatCsvData(result);
        }),
        catchError(err => {
            const errorMessage = 'Error while fetching blips for event' + ServiceNames[service];
            logError(errorMessage + '\n' + err);
            return throwError(errorMessage);
        }),
    );
}

let fillMissingQuadrants = function(blips: any[]) {
    let missingQuadrants = getMissingQuadrants(blips);
    missingQuadrants.forEach(quadrant => {
        addBlip(blips, ringsOrder[0], quadrant);
    });
};

let fillMissingRingsForAtLeastOneQuadrant = function(blips: any[]) {
    let existingRings = uniq(lodashMap(blips, 'ring'));
    let missingRings = difference(ringsOrder, existingRings);
    missingRings.forEach(ring => {
        addBlip(blips, ring, quadrantsOrder[0]);
    });
};

let getMissingQuadrants = function(blips: any[]) {
    let existingQuadrants = uniq(lodashMap(blips, 'quadrant'));
    return existingQuadrants.length < 4 ? difference(quadrantsOrder, existingQuadrants) : [];
};

let addBlip = function(blips: any[], ring: string, quadrant) {
    blips.push({
        name: 'Not Available',
        ring: ring,
        isNew: false,
        quadrant: quadrant,
        description: 'Not Available',
    });
};

function filterBlipsForReVote(serviceResult: any): any[] {
    const blipsForReVote = serviceResult.filter(b => b.forRevote);
    return sortByQuadrants(fillMissingBlips(blipsForReVote));
}

export function formatCsvData(serviceResult: any[]): string {
    if (isEmpty(serviceResult)) return '';
    let headers = ['name', 'ring', 'quadrant', 'isNew', 'description'];
    let result = serviceResult.map(blip => pick(blip, headers));
    const handleNull = (_key, value) => (value === null ? '' : value);
    let csv = result
        ? result.map(row => headers.map(fieldName => JSON.stringify(row[fieldName], handleNull)).join(','))
        : [];

    csv.unshift(headers.join(','));
    return csv.join('\r\n');
}
