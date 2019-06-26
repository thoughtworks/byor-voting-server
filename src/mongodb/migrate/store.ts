import { connectObs, findObs, updateOneObs } from 'observable-mongo';
import { switchMap, map, tap, toArray } from 'rxjs/operators';
import { config } from '../../api/config';

function MongodbStore() {
    this.mongoClient = null;
}

MongodbStore.prototype.getMigrationFilesExt = function() {
    const compilerIndex = process.argv.indexOf('--compiler');
    if (compilerIndex > -1) {
        const compilerOptionValue = process.argv[compilerIndex + 1];
        return compilerOptionValue.substr(0, compilerOptionValue.indexOf(':'));
    }
    return 'js';
};

MongodbStore.prototype.closeConnection = function() {
    if (!!this.mongoClient) {
        this.mongoClient.close();
    }
};

MongodbStore.prototype.save = function(set: any, cb: (error?: any) => any) {
    const migrationFilesExt = this.getMigrationFilesExt();
    const migrationEntry = {
        lastRun: set.lastRun.substr(0, set.lastRun.length - migrationFilesExt.length - 1),
        migrations: set.migrations.map(m => {
            return {
                ...m,
                title: m.title.substr(0, m.title.length - migrationFilesExt.length - 1),
            };
        }),
    };
    connectObs(config.mongoUriAdmin)
        .pipe(
            tap(client => (this.mongoClient = client)),
            map(client => client.db(config.dbname)),
            switchMap(db => {
                return updateOneObs({ _id: 0 }, migrationEntry, db.collection(config.migrationsCollection), {
                    upsert: true,
                });
            }),
            toArray(),
        )
        .subscribe(() => cb(), err => cb(err), () => this.closeConnection());
};

MongodbStore.prototype.load = function(cb: (error: any, set?: any) => any) {
    const migrationFilesExt = this.getMigrationFilesExt();
    connectObs(config.mongoUri)
        .pipe(
            tap(client => (this.mongoClient = client)),
            map(client => client.db(config.dbname)),
            switchMap(db => {
                return findObs(db.collection(config.migrationsCollection), { _id: 0 });
            }),
            toArray(),
            map((migrationEntries: any[]) => {
                return !!migrationEntries && !!migrationEntries.length
                    ? {
                          lastRun: `${migrationEntries[0].lastRun}.${migrationFilesExt}`,
                          migrations: migrationEntries[0].migrations.map(m => {
                              return {
                                  ...m,
                                  title: `${m.title}.${migrationFilesExt}`,
                              };
                          }),
                      }
                    : {};
            }),
        )
        .subscribe(migrationEntry => cb(null, migrationEntry), err => cb(err), () => this.closeConnection());
};

module.exports = MongodbStore;
