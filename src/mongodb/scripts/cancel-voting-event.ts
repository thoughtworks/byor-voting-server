import { mongodbService, CachedDB } from '../../api/service';
import { config } from '../../api/config';
import { ServiceNames } from '../../service-names';
import { ObjectId } from 'bson';
import { Observable } from 'rxjs';

export function cancelVotingEvent(eventId: ObjectId, cancelHard: boolean): Observable<any> {
    const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
    const params = { name: null, _id: eventId, hard: cancelHard };
    return mongodbService(cachedDb, ServiceNames.cancelVotingEvent, params);
}
