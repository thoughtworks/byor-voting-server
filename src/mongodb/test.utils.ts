import { Observable } from 'rxjs';
import { map, concatMap, tap } from 'rxjs/operators';

import { CachedDB, mongodbService } from '../api/service';
import { ServiceNames } from '../service-names';
import { IncomingHttpHeaders } from 'http';
import { Initiative } from '../model/initiative';
import { VotingEvent } from '../model/voting-event';
import { User, APPLICATION_ADMIN } from '../model/user';
import { ObjectId } from 'mongodb';
import { VotingEventFlow } from '../model/voting-event-flow';
import { cancelInitiative as cancelInitiativeApi } from '../api/initiative-api';
import { createInitiative as createInitiativeApi } from '../api/initiative-api';
import { config } from '../api/config';
import { openVotingEventVerified, cancelVotingEventVerified } from '../api/voting-event-apis';

const applicationAdministrator: User = { user: 'abc', pwd: '123', roles: [APPLICATION_ADMIN] };

//********************************************************************************************** */
// Utils for Authentication
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
export function authenticateAsAdminForTest(cachedDb: CachedDB) {
    return authenticateForTest(cachedDb, applicationAdministrator.user, applicationAdministrator.pwd);
}
//********************************************************************************************** */

//********************************************************************************************** */
// Utils for Initiatives
export function createInitiative(cachedDb: CachedDB, name: string, administrator: User) {
    return authenticateForTest(cachedDb, applicationAdministrator.user, applicationAdministrator.pwd).pipe(
        concatMap(headers => {
            return mongodbService(
                cachedDb,
                ServiceNames.createInitiative,
                {
                    name,
                    administrator,
                },
                null,
                headers,
            );
        }),
    );
}
export function cancelAndCreateInitiative(cachedDb: CachedDB, name: string, administrator: User, cancelHard: boolean) {
    let headers: {
        authorization: string;
    };
    let initiativeColl;
    let votingEventColl;
    let votesColl;
    let usersColl;
    return authenticateForTest(cachedDb, applicationAdministrator.user, applicationAdministrator.pwd).pipe(
        tap(_headers => (headers = _headers)),
        tap(() => {
            initiativeColl = cachedDb.db.collection(config.initiativeCollection);
            votingEventColl = cachedDb.db.collection(config.votingEventsCollection);
            votesColl = cachedDb.db.collection(config.votesCollection);
            usersColl = cachedDb.db.collection(config.usersCollection);
        }),
        concatMap(() => {
            return cancelInitiativeApi(
                initiativeColl,
                votingEventColl,
                votesColl,
                usersColl,
                { name, hard: cancelHard },
                applicationAdministrator.user,
            );
        }),
        concatMap(() => {
            return createInitiativeApi(
                initiativeColl,
                usersColl,
                { name, administrator },
                applicationAdministrator.user,
            );
        }),
        map(() => headers),
    );
}
export function readInitiative(cachedDb: CachedDB, initiativeName: string, options?: any) {
    return mongodbService(cachedDb, ServiceNames.getInitiatives, options).pipe(
        map((initiatives: Initiative[]) => {
            return initiatives.find(i => i.name === initiativeName);
        }),
    );
}
export function cancelInitiative(
    cachedDb: CachedDB,
    initiativeName: string,
    headers: {
        authorization: string;
    },
    options?: any,
) {
    let params = { name: initiativeName };
    if (options) {
        params = { ...params, ...options };
    }
    return mongodbService(cachedDb, ServiceNames.cancelInitiative, params, null, headers);
}
export function undoCancelInitiative(
    cachedDb: CachedDB,
    initiativeName: string,
    headers: {
        authorization: string;
    },
) {
    const params = { name: initiativeName };
    return mongodbService(cachedDb, ServiceNames.undoCancelInitiative, params, null, headers);
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
    return cancelAndCreateInitiative(cachedDb, initiativeName, initiativeAdmin, true).pipe(
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
    return createVotingEventForVotingEventAndReturnHeaders(cachedDb, votingEventName).pipe(
        tap(data => {
            votingEventId = data.votingEventId.toHexString();
        }),
        concatMap(() => openVotingEvent(cachedDb, votingEventId)),
    );
}
export function openVotingEvent(cachedDb: CachedDB, votingEventId: string) {
    return openVotingEventVerified(
        cachedDb.db.collection(config.votingEventsCollection),
        cachedDb.db.collection(config.technologiesCollection),
        votingEventId,
    ).pipe(map(() => votingEventId));
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
export function cancelVotingEvent(cachedDb: CachedDB, votingEventId: ObjectId, hard: boolean) {
    return cancelVotingEventVerified(
        cachedDb.db.collection(config.votingEventsCollection),
        cachedDb.db.collection(config.votesCollection),
        votingEventId,
        null,
        hard,
    );
}
//********************************************************************************************** */

//********************************************************************************************** */
// Utils for Users
export function deleteUsers(cachedDb: CachedDB, users: string[]) {
    return mongodbService(cachedDb, ServiceNames.deleteUsers, { users });
}
//********************************************************************************************** */
