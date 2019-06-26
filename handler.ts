import { APIGatewayEvent, Context, Callback } from 'aws-lambda';
import { _executeService, getAllBlips, getBlipsForEvent, getBlipsForRevote } from './api-service';
import { logDebug } from './src/lib/utils';

export const executeService = (event: APIGatewayEvent, context: Context, callback: Callback<any>) => {
    logDebug('path to execute: ' + event.path);

    if (event.path === '/executeService/votes/blips.csv') {
        getAllBlips(event, context, callback);
    } else if (
        event.pathParameters &&
        event.pathParameters['id'] &&
        event.path === '/executeService/votes/' + event.pathParameters['id'] + '/blips.csv'
    ) {
        getBlipsForEvent(event, context, callback);
    } else if (
        event.pathParameters &&
        event.pathParameters['id'] &&
        event.path === '/executeService/votes/' + event.pathParameters['id'] + '/revote/blips.csv'
    ) {
        getBlipsForRevote(event, context, callback);
    } else {
        _executeService(event, context, callback);
    }
};
