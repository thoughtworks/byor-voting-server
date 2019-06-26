import { from, concat, of } from 'rxjs';
import { Db } from 'mongodb';
import { tap, concatMap } from 'rxjs/operators';

import { config } from '../../api/config';
import { performValidationFrom$ } from '../../lib/db-validations';
import { logObsError, logObsCompleted, logInfo } from '../../lib/utils';

export function up(next: (error?: any) => any) {
    const quadrants = ['Tools', 'Platforms', 'Techniques', 'Languages & Frameworks'];
    const rings = ['Adopt', 'Trial', 'Assess', 'hold'];

    const validations = [
        {
            message: 'technology.quadrant',
            collection: config.technologiesCollection,
            refereceValues: quadrants,
            mongoFilterParams: { field: '$quadrant' },
            updateFieldsF: (foundItem: { db: Db; values: any }) => ({ quadrant: foundItem.values.newValue }),
        },
        {
            message: 'vote.technology.quadrant',
            collection: config.votesCollection,
            refereceValues: quadrants,
            mongoFilterParams: { field: '$technology.quadrant' },
            updateFieldsF: (foundItem: { db: Db; values: any }) => ({
                'technology.quadrant': foundItem.values.newValue,
            }),
        },
        {
            message: 'vote.ring',
            collection: config.votesCollection,
            refereceValues: rings,
            mongoFilterParams: { field: '$ring' },
            updateFieldsF: (foundItem: { db: Db; values: any }) => ({ ring: foundItem.values.newValue }),
        },
        {
            message: 'votingevents.technologies.quadrant',
            collection: config.votingEventsCollection,
            refereceValues: quadrants,
            mongoFilterParams: { field: '$technologies.quadrant', nestedArrays: ['technologies'] },
            updateFieldsF: (foundItem: { db: Db; values: any }) => ({
                ['technologies.' + foundItem.values.technologiesIndex + '.quadrant']: foundItem.values.newValue,
            }),
        },
        {
            message: 'votingevents.blips.quadrant',
            collection: config.votingEventsCollection,
            refereceValues: quadrants,
            mongoFilterParams: { field: '$blips.quadrant', nestedArrays: ['blips'] },
            updateFieldsF: (foundItem: { db: Db; values: any }) => ({
                ['blips.' + foundItem.values.blipsIndex + '.quadrant']: foundItem.values.newValue,
            }),
        },
        {
            message: 'votingevents.blips.ring',
            collection: config.votingEventsCollection,
            refereceValues: rings,
            mongoFilterParams: { field: '$blips.ring', nestedArrays: ['blips'] },
            updateFieldsF: (foundItem: { db: Db; values: any }) => ({
                ['blips.' + foundItem.values.blipsIndex + '.ring']: foundItem.values.newValue,
            }),
        },
        {
            message: 'votingevents.blips.votes.ring',
            collection: config.votingEventsCollection,
            refereceValues: rings,
            mongoFilterParams: { field: '$blips.votes.ring', nestedArrays: ['blips', 'votes'] },
            updateFieldsF: (foundItem: { db: Db; values: any }) => ({
                ['blips.' + foundItem.values.blipsIndex + '.votes.' + foundItem.values.votesIndex + '.ring']: foundItem
                    .values.newValue,
            }),
        },
        {
            message: 'votingevents.blips.votes.technology.quadrant',
            collection: config.votingEventsCollection,
            refereceValues: quadrants,
            mongoFilterParams: { field: '$blips.votes.technology.quadrant', nestedArrays: ['blips', 'votes'] },
            updateFieldsF: (foundItem: { db: Db; values: any }) => ({
                ['blips.' +
                foundItem.values.blipsIndex +
                '.votes.' +
                foundItem.values.votesIndex +
                '.technology.quadrant']: foundItem.values.newValue,
            }),
        },
    ];

    concat(
        of('searching for non fixable values...').pipe(tap(msg => logInfo(msg))),
        from(validations).pipe(
            concatMap(validation =>
                performValidationFrom$({
                    ...validation,
                    fixWrongValues: false,
                    stopOnUnfixableValues: true,
                }),
            ),
        ),
        of('fixing values...').pipe(tap(msg => logInfo(msg))),
        from(validations).pipe(
            concatMap(validation =>
                performValidationFrom$({
                    ...validation,
                    fixWrongValues: true,
                    stopOnUnfixableValues: false,
                }),
            ),
        ),
    ).subscribe({
        next: null,
        error: err => logObsError(err),
        complete: () => logObsCompleted(next),
    });
}
