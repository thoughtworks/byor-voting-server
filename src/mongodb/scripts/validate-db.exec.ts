import { from, concat, of } from 'rxjs';
import { Db } from 'mongodb';
import { concatMap, tap } from 'rxjs/operators';

import { config } from '../../api/config';
import { performValidationFrom$ } from '../../lib/db-validations';
import { logInfo } from '../../lib/utils';

const quadrants = ['Tools', 'Platforms', 'Techniques', 'Languages & Frameworks'];
const rings = ['Adopt', 'Trial', 'Assess', 'hold'];

const fixWrongValues = (process.argv[2] || 'Y').toUpperCase() == 'Y' ? true : false;

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
    of(fixWrongValues ? 'fixing values...' : 'searching for fixable values...').pipe(tap(msg => logInfo(msg))),
    from(validations).pipe(
        concatMap(validation =>
            performValidationFrom$({
                ...validation,
                fixWrongValues: fixWrongValues,
                stopOnUnfixableValues: false,
            }),
        ),
    ),
).subscribe({
    next: null,
    error: err => {
        throw err;
    },
    complete: () => logInfo('completed'),
});
