import { Collection } from 'mongodb';
import { insertOneObs } from 'observable-mongo';

export function saveLog(logColl: Collection<any>, data: { reason: string; logInfo: string }, ipAddress: string) {
    const logData = { reason: data.reason, logInfo: data.logInfo, ipAddress, ts: new Date(Date.now()).toISOString() };
    return insertOneObs(logData, logColl);
}
