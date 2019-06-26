import { ObjectId } from 'bson';
import { cancelVotingEvent } from './cancel-voting-event';
import { logError } from '../../lib/utils';

cancelVotingEvent(new ObjectId(process.argv[2]), process.argv[3] === 'H').subscribe(
    () => {
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
