import { ObjectId } from 'mongodb';
import { logError } from '../lib/utils';

export function getObjectId(id: any) {
    // id can be either a mongo ObjectId if this method is called from another server method
    // or a string if it is called as a consequence of a call from the client
    let eventId: ObjectId;
    if (id && id instanceof ObjectId) {
        eventId = id;
    } else {
        if (typeof id === 'string') {
            try {
                eventId = new ObjectId(id);
            } catch (err) {
                logError(err);
                throw 'Not a valid id to search for events - id: ' + eventId;
            }
        }
    }
    return eventId;
}
