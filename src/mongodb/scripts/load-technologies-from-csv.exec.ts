import { loadTechnologies } from './load-technologies';
import * as fs from 'fs';
import * as csv from 'csv-parse';
import * as _ from 'underscore';
import { logError, logInfo } from '../../lib/utils';

const csvFile = process.argv[2] || `${__dirname}/../../../data/TW_blips.csv`;
if (!csvFile) {
    logError('we expect a csv file');
    process.exit(1);
}

logInfo('loading technologies from URL:' + csvFile);

const nameColumn = `gsx\$${process.argv[3] || 'name'}`;
const quadrantColumn = `gsx\$${process.argv[4] || 'quadrant'}`;
const isNewColumn = `gsx\$${process.argv[5] || 'is_new'}`;

var dataset = [];

fs.createReadStream(csvFile)
    .pipe(csv())
    .on('data', function(row) {
        dataset.push(row);
    })
    .on('end', function() {
        var columns = dataset[0];
        var technologies = _.chain(dataset)
            .rest()
            .map(function(row, index) {
                var rowObj = _.object(columns, row);
                return {
                    id: index,
                    name: rowObj[nameColumn],
                    quadrant: rowObj[quadrantColumn],
                    isNew: rowObj[isNewColumn].toLowerCase() == 'true' ? true : false,
                };
            })
            .value();
        loadTechnologies(technologies).subscribe(
            res => {
                logInfo('Load result' + JSON.stringify(res, null, 2));
                process.exit(0);
            },
            err => {
                logError(err);
                process.exit(1);
            },
            () => {
                process.exit(0);
            },
        );
    });
