// https://medium.com/dailyjs/real-time-apps-with-typescript-integrating-web-sockets-node-angular-e2b57cbd1ec1?t=1&cn=ZmxleGlibGVfcmVjcw%3D%3D&refsrc=email&iid=9b197a27b4a14948b1d2fd4ad999e0a1&uid=39235406&nid=244%20276893704

import { Observable } from 'rxjs';
import { tap, mergeMap, map, takeUntil, switchMap } from 'rxjs/operators';

import { ISocketObs } from './socket-obs.interface';
import { RefreshTrigger } from '../src/refresh-trigger';
import { mongodbService, CachedDB } from '../src/api/service';
import { config } from '../src/api/config';
import { ServiceNames } from '../src/service-names';
import { logDebug } from '../src/lib/utils';

export class SocketServer {
    private cachedDb: CachedDB = { dbName: config.dbname, db: null, client: null };

    constructor() {}

    public start(socketObs: Observable<ISocketObs>) {
        socketObs
            .pipe(
                tap(() => logDebug('Connected client')),
                mergeMap(socket =>
                    RefreshTrigger.getRefreshTrigger().pipe(
                        switchMap(() => mongodbService(this.cachedDb, ServiceNames.aggregateVotes)),
                        map(aggregatedVotes => socket.send('aggregatedVotes', aggregatedVotes)),
                        takeUntil(socket.onDisconnect()),
                    ),
                ),
            )
            .subscribe();
    }
}
