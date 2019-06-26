'use strict';

import { config } from '../../api/config';
import { findAndUpdateDoc$ } from '../../lib/db-utils';

import { logObsNext, logObsError, logObsCompleted, logInfo } from '../../lib/utils';
import { getPasswordHash$ } from '../../lib/observables';
import { mergeMap } from 'rxjs/operators';

const oldAdminUsername = process.argv[2];
const newAdminUsername = process.argv[3];
const newAdminPassword = process.argv[4];

getPasswordHash$(newAdminPassword)
    .pipe(
        mergeMap(hash =>
            findAndUpdateDoc$(config.usersCollection, { user: oldAdminUsername }, () => {
                return { user: newAdminUsername, pwd: hash };
            }),
        ),
    )
    .subscribe(
        nextVal => logObsNext(nextVal),
        error => logObsError(error),
        () =>
            logObsCompleted(() => {
                logInfo('Admin credential updated!');
            }),
    );
