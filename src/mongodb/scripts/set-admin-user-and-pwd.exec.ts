'use strict';

import { logObsNext, logObsError, logObsCompleted, logInfo } from '../../lib/utils';
import { setAdminUserAndPwd } from './set-admin-user-and-pwd';

const oldAdminUsername = process.argv[2];
const newAdminUsername = process.argv[3];
const newAdminPassword = process.argv[4];

setAdminUserAndPwd(oldAdminUsername, newAdminUsername, newAdminPassword).subscribe(
    nextVal => logObsNext(nextVal),
    error => logObsError(error),
    () =>
        logObsCompleted(() => {
            logInfo('Admin credential updated!');
        }),
);
