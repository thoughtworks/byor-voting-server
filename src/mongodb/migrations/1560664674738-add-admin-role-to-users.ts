import { logObsNext, logObsError, logObsCompleted } from '../../lib/utils';
import { config } from '../../api/config';
import { findAndUpdateDoc$ } from '../../lib/db-utils';
import { APPLICATION_ADMIN } from '../../model/user';

export function up(next: (error?: any) => any) {
    findAndUpdateDoc$(config.usersCollection, {}, () => ({
        roles: [APPLICATION_ADMIN],
    })).subscribe(nextVal => logObsNext(nextVal), error => logObsError(error), () => logObsCompleted(next));
}
