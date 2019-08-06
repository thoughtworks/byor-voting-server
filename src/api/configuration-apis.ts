import { switchMap, toArray, map } from 'rxjs/operators';
import { Collection } from 'mongodb';

import { findObs, dropObs, insertManyObs } from 'observable-mongo';

export function getConfiguration(configurationColl: Collection<any>, _params?: { user: string }) {
    let querySelector: any = { user: { $exists: false } };
    if (_params && _params.user) {
        querySelector = { $or: [{ user: _params.user }, { user: { $exists: false } }] };
    }
    return findObs(configurationColl, querySelector).pipe(
        toArray(),
        map(configRecords => {
            const defaultConfig = configRecords.find(r => !r.user);
            if (_params && _params.user) {
                const userConfig = configRecords.find(r => r.user === _params.user);
                return userConfig ? { ...defaultConfig.config, ...userConfig.config } : defaultConfig.config;
            }
            return defaultConfig.config;
        }),
    );
}

export function laodConfiguration(configurationColl: Collection<any>, configuration: any[]) {
    return dropObs(configurationColl).pipe(switchMap(() => insertManyObs(configuration, configurationColl)));
}
