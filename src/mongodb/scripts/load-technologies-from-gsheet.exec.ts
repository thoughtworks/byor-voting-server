import * as request from 'request';
import * as _ from 'lodash';
import { loadTechnologies } from './load-technologies';
import { logInfo, logError } from '../../lib/utils';

const spreadsheetId = process.argv[2];
if (!spreadsheetId) {
    logError('we expect a spreadsheet id');
    process.exit(1);
}

const sheetNumber = process.argv[3] || 1;

const spreadsheetUrl = `https://spreadsheets.google.com/feeds/list/${spreadsheetId}/${sheetNumber}/public/values?alt=json`;
logInfo('loading technologies from URL:' + spreadsheetUrl);

const nameColumn = `gsx\$${process.argv[4] || 'name'}`;
const quadrantColumn = `gsx\$${process.argv[5] || 'quadrant'}`;
const isNewColumn = `gsx\$${process.argv[6] || 'isnew'}`;

request(spreadsheetUrl, (error, response, body) => {
    if (!error && response.statusCode === 200) {
        var gsheetData = JSON.parse(body).feed.entry;
        var data = _.map(gsheetData, (entry, i) => {
            return {
                id: `${i}`,
                name: entry[nameColumn].$t,
                quadrant: entry[quadrantColumn].$t,
                isNew: entry[isNewColumn].$t.toLowerCase() == 'true' ? true : false,
            };
        });
        loadTechnologies(data).subscribe(
            res => {
                logInfo('Load result ' + JSON.stringify(res, null, 2));
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
    } else {
        logError("Couldn't get spreadsheet data " + error + '\n' + response + '\n' + body);
        process.exit(1);
    }
});
