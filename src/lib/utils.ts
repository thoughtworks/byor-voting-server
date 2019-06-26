import { inspect } from 'util';

export const logError = (message: string) => {
    _log(message, 'ERROR');
};
export const logInfo = (message: string) => {
    _log(message, 'INFO');
};
export const logWarning = (message: string) => {
    _log(message, 'WARNING');
};
export const logDebug = (message: string) => {
    _log(message, 'DEBUG');
};
export const logTrace = (message: string) => {
    _log(message, 'TRACE');
};
export const _log = (message: string, level?: string) => {
    const levels = { ERROR: -1, INFO: 0, WARNING: 2, DEBUG: 3, TRACE: 4 };
    const sysLevel = process.env['TRACE_LEVEL'] || 'INFO';
    const msgLevel = level || 'INFO';
    const msgOutput = '-->[' + msgLevel + '] ' + message;
    if (levels[sysLevel] >= levels[msgLevel]) {
        if (msgLevel == 'ERROR') console.error(msgOutput);
        else console.log(msgOutput);
    }
};

export const logObsNext = nextValue => {
    logTrace('OBS-NEXT: ' + inspect(nextValue));
};

export const logObsError = error => {
    throw error;
};

export const logObsCompleted = nextF => {
    logTrace('OBS-COMPLETED');
    nextF();
};
