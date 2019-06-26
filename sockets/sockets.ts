import { Server } from 'http';

import { Observable } from 'rxjs';
import { Observer } from 'rxjs';

import * as socketIoServer from 'socket.io';

import { SocketObs } from './socket-obs';
import { logDebug } from '../src/lib/utils';

export function sockets(httpServer: Server, port) {
    httpServer.listen(port, () => {
        logDebug('Running server on port %s' + port);
    });
    return new Observable<SocketObs>((subscriber: Observer<SocketObs>) => {
        socketIoServer(httpServer).on('connect', socket => {
            logDebug('client connected');
            subscriber.next(new SocketObs(socket));
        });
    });
}
