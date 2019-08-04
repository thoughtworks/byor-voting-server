import { logObsNext, logObsError, logObsCompleted } from '../../lib/utils';
import { config } from '../../api/config';
import { findAndUpdateDoc$ } from '../../lib/db-utils';

export function up(next: (error?: any) => any) {
    findAndUpdateDoc$(config.usersCollection, {}, () => ({
        roles: ['admin'],
    })).subscribe(nextVal => logObsNext(nextVal), error => logObsError(error), () => logObsCompleted(next));
}
