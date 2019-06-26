import { countVoters } from './count-voters';
import { logError } from '../../lib/utils';
import { inspect } from 'util';

const eventId = process.argv[2] ? process.argv[2].trim() : null;

countVoters(eventId).subscribe(
    () => {
        process.exit(0);
    },
    err => {
        logError(inspect(err));
        process.exit(1);
    },
    () => {
        process.exit(0);
    },
);
