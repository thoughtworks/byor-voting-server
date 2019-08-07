import { concatMap } from 'rxjs/operators';

import { getPasswordHash$ } from '../../lib/observables';
import { updateOneObs } from 'observable-mongo';
import { Collection } from 'mongodb';
import { User, APPLICATION_ADMIN } from '../../model/user';

export function addAdminUserAndPwd(newAdminUsername: string, newAdminPassword: string, userCollection: Collection) {
    return getPasswordHash$(newAdminPassword).pipe(
        concatMap(hash => {
            const admin: User = { user: newAdminUsername, pwd: hash, roles: [APPLICATION_ADMIN] };
            return updateOneObs({ user: newAdminUsername }, admin, userCollection, {
                upsert: true,
            });
        }),
    );
}
