import * as mango from 'observable-mongo';
import { of, EMPTY } from 'rxjs';
import * as sinon from 'sinon';
import { saveLog } from './client-log-apis';

describe('Logging', () => {
    let sandbox;
    let obsMongo;
    let insertOneObs;
    const collection: any = { collectionName: 'logs' };

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        obsMongo = sandbox.mock(mango);

        insertOneObs = obsMongo.expects('insertOneObs');
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('saves the log', () => {
        const log = { reason: 'the reason for log', logInfo: 'info for the log' };
        const ipAddress = '10.111.13.38';
        const isoDateRegex = /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)/;
        const expectedLog = {
            reason: log.reason,
            logInfo: log.logInfo,
            ipAddress,
            ts: sinon.match(isoDateRegex),
        };

        insertOneObs
            .withArgs(expectedLog, collection)
            .once()
            .returns(of(EMPTY));

        saveLog(collection, log, ipAddress).subscribe();
        insertOneObs.verify();
    });
});
