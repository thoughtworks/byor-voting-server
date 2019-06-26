import { extractVotesToFile } from './extract-votes-to-file';
import { logError } from '../../lib/utils';

const fileName = process.argv[2];
const votingEventId = process.argv[3] ? process.argv[3].trim() : null;

extractVotesToFile(fileName, votingEventId).subscribe(
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
