import { expect } from 'chai';

import { CachedDB, mongodbService } from '../api/service';
import { config } from '../api/config';
import { ServiceNames } from '../service-names';
import { concatMap, tap, map } from 'rxjs/operators';
import { logError } from '../lib/utils';
import { Initiative } from '../model/initiative';
import { Credentials } from '../model/credentials';
import { VotingEvent } from '../model/voting-event';

describe('1 - create read and delete hard initiatives', () => {
    it('Create an initiative, reads it and then delete it hard', done => {
        const initiativeName = 'The first initiative';

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        // first clean the db
        mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true })
            // then start the test
            .pipe(
                concatMap(() => mongodbService(cachedDb, ServiceNames.createInitiative, { name: initiativeName })),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getInititives)),
                tap((initiatives: Initiative[]) => {
                    const initiative = initiatives.find(i => i.name === initiativeName);
                    expect(initiative).to.be.not.undefined;
                }),
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true }),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getInititives)),
                tap((initiatives: Initiative[]) => {
                    const initiative = initiatives.find(i => i.name === initiativeName);
                    expect(initiative).to.be.undefined;
                }),
                // clean the db
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true }),
                ),
            )
            .subscribe(
                null,
                err => {
                    cachedDb.client.close();
                    logError(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('Create an initiative, reads it and then delete it soft', done => {
        const initiativeName = 'The second initiative';

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        // first clean the db
        mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true })
            // then start the test
            .pipe(
                concatMap(() => mongodbService(cachedDb, ServiceNames.createInitiative, { name: initiativeName })),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getInititives)),
                tap((initiatives: Initiative[]) => {
                    const initiative = initiatives.find(i => i.name === initiativeName);
                    expect(initiative).to.be.not.undefined;
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName })),
                // read without specifying any param, which means that the initiatives cancelled logically will not be read
                concatMap(() => mongodbService(cachedDb, ServiceNames.getInititives)),
                tap((initiatives: Initiative[]) => {
                    const initiative = initiatives.find(i => i.name === initiativeName);
                    expect(initiative).to.be.undefined;
                }),
                // read all initiatives, including the ones cancelled logically
                concatMap(() => mongodbService(cachedDb, ServiceNames.getInititives, { all: true })),
                tap((initiatives: Initiative[]) => {
                    const initiative = initiatives.find(i => i.name === initiativeName);
                    expect(initiative).to.be.not.undefined;
                }),
                // clean the db
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true }),
                ),
            )
            .subscribe(
                null,
                err => {
                    cachedDb.client.close();
                    logError(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);
});

describe('2 - create an Initiative and then a VotingEvent on this Initiative', () => {
    it('Create an Initiative, then a VotigEvent on it, reads it and then delete it hard', done => {
        const initiativeName = 'The first initiative with a VotingEvent';
        const votingEventName = 'The first VotingEvent on an Initiative';
        const initiativeAdministrator: Credentials = { userId: 'The mean Initiative Administrator' };
        let votingEventId: string;

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        // first clean the db
        mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true })
            // then start the test
            .pipe(
                concatMap(() => mongodbService(cachedDb, ServiceNames.createInitiative, { name: initiativeName })),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getInititives)),
                map((initiatives: Initiative[]) => initiatives.find(i => i.name === initiativeName)),
                concatMap((initiative: Initiative) =>
                    mongodbService(cachedDb, ServiceNames.createVotingEvent, {
                        name: votingEventName,
                        creator: initiativeAdministrator,
                        initiativeName: initiative.name,
                        initiativeId: initiative._id.toHexString(),
                    }),
                ),
                tap(_id => {
                    votingEventId = _id.toHexString();
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id: votingEventId })),
                tap((votingEvent: VotingEvent) => {
                    expect(votingEvent).to.be.not.undefined;
                    expect(votingEvent.name).equal(votingEventName);
                }),
                // cancel hard the Initiative
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true }),
                ),
                // now the voting event should not be there
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id: votingEventId })),
                tap((votingEvent: VotingEvent) => {
                    expect(votingEvent).to.be.undefined;
                }),
                // clean the db
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true }),
                ),
            )
            .subscribe(
                null,
                err => {
                    cachedDb.client.close();
                    logError(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);

    it('Create an Initiative, then a VotigEvent on it, reads it and then delete it soft', done => {
        const initiativeName = 'The second initiative with a VotingEvent';
        const votingEventName = 'The second VotingEvent on an Initiative';
        const initiativeAdministrator: Credentials = { userId: 'The nice Initiative Administrator' };
        let initiativeId: string;
        let votingEventId: string;

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        // first clean the db
        mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true })
            // then start the test
            .pipe(
                concatMap(() => mongodbService(cachedDb, ServiceNames.createInitiative, { name: initiativeName })),
                tap(_id => {
                    initiativeId = _id.toHexString();
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getInititives)),
                map((initiatives: Initiative[]) => initiatives.find(i => i.name === initiativeName)),
                concatMap((initiative: Initiative) =>
                    mongodbService(cachedDb, ServiceNames.createVotingEvent, {
                        name: votingEventName,
                        creator: initiativeAdministrator,
                        initiativeName: initiative.name,
                        initiativeId: initiative._id.toHexString(),
                    }),
                ),
                tap(_id => {
                    votingEventId = _id.toHexString();
                }),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id: votingEventId })),
                tap((votingEvent: VotingEvent) => {
                    expect(votingEvent).to.be.not.undefined;
                    expect(votingEvent.name).equal(votingEventName);
                    expect(votingEvent.initiativeId).equal(initiativeId);
                    expect(votingEvent.initiativeName).equal(initiativeName);
                }),
                // cancel soft the Initiative
                concatMap(() => mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName })),
                // now the voting event not be found but should result cancelled logically
                concatMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id: votingEventId })),
                tap(votingEvent => {
                    expect(votingEvent).to.be.undefined;
                }),
                // clean the db
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true }),
                ),
            )
            .subscribe(
                null,
                err => {
                    cachedDb.client.close();
                    logError(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);
});
