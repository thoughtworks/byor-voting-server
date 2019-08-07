import { concatMap } from 'rxjs/operators';

import { getPasswordHash$ } from '../../lib/observables';
import { findAndUpdateDoc$ } from '../../lib/db-utils';
import { config } from '../../api/config';

export function setAdminUserAndPwd(oldAdminUsername: string, newAdminUsername: string, newAdminPassword: string) {
    return getPasswordHash$(newAdminPassword).pipe(
        concatMap(hash =>
            findAndUpdateDoc$(config.usersCollection, { user: oldAdminUsername }, () => {
                return { user: newAdminUsername, pwd: hash };
            }),
        ),
    );
}
