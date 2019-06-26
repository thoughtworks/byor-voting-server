import { createServer, Server } from 'http';
import * as express from 'express';

import { sockets } from './sockets/sockets';
import { SocketServer } from './sockets/socket-server';
import { logInfo } from './src/lib/utils';

export const startSocketServer = () => {
    logInfo('start socket server');

    const expressServer = express();
    const port = process.env.PORT || 8081;

    const httpServer: Server = createServer(expressServer);

    const socketsObervable = sockets(httpServer, port);

    const socketServer = new SocketServer();
    socketServer.start(socketsObervable);
};
