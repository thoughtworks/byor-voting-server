import { Observable } from 'rxjs';
import { map, concatMap, tap } from 'rxjs/operators';

import { CachedDB, mongodbService } from '../api/service';
import { ServiceNames } from '../service-names';
import { IncomingHttpHeaders } from 'http';
import { Initiative } from '../model/initiative';
import { VotingEvent } from '../model/voting-event';
import { User } from '../model/user';
import { ObjectId } from 'mongodb';
import { VotingEventFlow } from '../model/voting-event-flow';

//********************************************************************************************** */
// Utils for VotingEvents
export function createHeaders(token: string) {
    const tokenForHeader = 'Bearer ' + token;
    const headers = {
        authorization: tokenForHeader,
    };
    return headers;
}
export function authenticateForTest(cachedDb: CachedDB, user: string, pwd: string) {
    return mongodbService(cachedDb, ServiceNames.authenticateOrSetPwdIfFirstTime, {
        user,
        pwd,
    }).pipe(
        map(data => {
            return createHeaders(data.token);
        }),
    );
}
//********************************************************************************************** */

//********************************************************************************************** */
// Utils for Initiatives
export function createInitiative(cachedDb: CachedDB, name: string, administrator: User) {
    return mongodbService(cachedDb, ServiceNames.createInitiative, {
        name,
        administrator,
    });
}
export function readInitiative(cachedDb: CachedDB, initiativeName: string, options?: any) {
    return mongodbService(cachedDb, ServiceNames.getInititives, options).pipe(
        map((initiatives: Initiative[]) => {
            return initiatives.find(i => i.name === initiativeName);
        }),
    );
}
export function cancelInitiative(cachedDb: CachedDB, initiativeName: string, options?: any) {
    let params = { name: initiativeName };
    if (options) {
        params = { ...params, ...options };
    }
    return mongodbService(cachedDb, ServiceNames.cancelInitiative, params);
}
//********************************************************************************************** */

//********************************************************************************************** */
// Utils for VotingEvents
export function createVotingEventForTest(
    cachedDb: CachedDB,
    name: string,
    headers: IncomingHttpHeaders,
    initiativeName?: string,
    initiativeId?: string,
    flow?: VotingEventFlow,
): Observable<ObjectId> {
    return mongodbService(
        cachedDb,
        ServiceNames.createVotingEvent,
        {
            name,
            initiativeName,
            initiativeId,
            flow,
        },
        null,
        headers,
    );
}
export function createVotingEventForVotingEventAndReturnHeaders(
    cachedDb: CachedDB,
    newVotingEvent: string,
    flow?: VotingEventFlow,
) {
    const initiativeName = `Test initiative for VotingEvent ${newVotingEvent}`;
    const initiativeAdmin = { user: `Admin for initiative ${initiativeName}` };
    let initiative: Initiative;
    return mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true }).pipe(
        concatMap(() => createInitiative(cachedDb, initiativeName, initiativeAdmin)),
        concatMap(() => readInitiative(cachedDb, initiativeName)),
        tap(_initiative => (initiative = _initiative)),
        concatMap(() => authenticateForTest(cachedDb, initiativeAdmin.user, 'my password')),
        concatMap(headers =>
            createVotingEventForTest(cachedDb, newVotingEvent, headers, initiativeName, initiative._id, flow).pipe(
                map(votingEventId => ({ votingEventId, headers })),
            ),
        ),
    );
}
export function createVotingEventForVotingEventTest(
    cachedDb: CachedDB,
    newVotingEvent: string,
    flow?: VotingEventFlow,
) {
    return createVotingEventForVotingEventAndReturnHeaders(cachedDb, newVotingEvent, flow).pipe(
        map(data => data.votingEventId),
    );
}
export function createAndOpenVotingEvent(cachedDb: CachedDB, votingEventName: string) {
    let votingEventId;
    let headers;
    return createVotingEventForVotingEventAndReturnHeaders(cachedDb, votingEventName).pipe(
        tap(data => {
            votingEventId = data.votingEventId;
            headers = data.headers;
        }),
        concatMap(() => openVotingEvent(cachedDb, votingEventId, headers)),
    );
}
export function openVotingEvent(cachedDb: CachedDB, votingEventId: ObjectId, headers) {
    return mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id: votingEventId }, null, headers).pipe(
        map(() => votingEventId),
    );
}
export function readVotingEvent(cachedDb: CachedDB, votingEventId: string): Observable<VotingEvent> {
    if (typeof votingEventId !== 'string') {
        throw Error('A string is expected');
    }
    return mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id: votingEventId });
}
export function readVotingEvents(
    cachedDb: CachedDB,
    options?: { full?: boolean; all?: boolean },
): Observable<VotingEvent[]> {
    return mongodbService(cachedDb, ServiceNames.getVotingEvents, options);
}
//********************************************************************************************** */
