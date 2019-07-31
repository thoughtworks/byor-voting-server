import { expect } from 'chai';

import { CachedDB, mongodbService } from '../api/service';
import { config } from '../api/config';
import { ServiceNames } from '../service-names';
import { concatMap, tap, map, toArray } from 'rxjs/operators';
import { logError } from '../lib/utils';
import { Initiative } from '../model/initiative';
import { Credentials } from '../model/credentials';
import { VotingEvent } from '../model/voting-event';
import { User, INITIATIVE_ADMINISTRATOR } from '../model/user';
import { findObs } from 'observable-mongo';
import { createHeaders } from './test.utils';

describe('1 - create read and delete initiatives', () => {
    it('Create an initiative, reads it and then delete it hard', done => {
        const initiativeName = 'The first initiative';
        const initiativeAdmin: User = { user: 'The admin of the first initiative' };

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        // first clean the db
        mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true })
            // then start the test
            .pipe(
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.createInitiative, {
                        name: initiativeName,
                        administrator: initiativeAdmin,
                    }),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getInititives)),
                map((initiatives: Initiative[]) => {
                    return initiatives.find(i => i.name === initiativeName);
                }),
                tap((initiative: Initiative) => {
                    expect(initiative).to.be.not.undefined;
                    expect(initiative.name).equal(initiativeName);
                }),
                concatMap((initiative: Initiative) => {
                    const userColl = cachedDb.db.collection(config.usersCollection);
                    const selector = { initiativeId: initiative._id.toHexString() };
                    return findObs(userColl, selector);
                }),
                tap((user: User) => {
                    expect(user).to.be.not.undefined;
                    expect(user.user).equal(initiativeAdmin.user);
                    expect(user.initiativeName).equal(initiativeName);
                }),
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true }),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getInititives)),
                map((initiatives: Initiative[]) => {
                    return initiatives.find(i => i.name === initiativeName);
                }),
                tap((initiative: Initiative) => {
                    expect(initiative).to.be.undefined;
                }),
                concatMap(() => {
                    const userColl = cachedDb.db.collection(config.usersCollection);
                    const selector = { initiativeName };
                    return findObs(userColl, selector);
                }),
                tap((user: User) => {
                    expect(user).to.be.undefined;
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
        const initiativeAdmin: User = { user: 'The admin of the second initiative' };

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        // first clean the db
        mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true })
            // then start the test
            .pipe(
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.createInitiative, {
                        name: initiativeName,
                        administrator: initiativeAdmin,
                    }),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getInititives)),
                tap((initiatives: Initiative[]) => {
                    const initiative = initiatives.find(i => i.name === initiativeName);
                    expect(initiative).to.be.not.undefined;
                }),
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.cancelInitiative, {
                        name: initiativeName,
                    }),
                ),
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
        const initiativeAdmin: User = { user: 'The admin of the the first initiative with a VotingEvent' };
        const votingEventName = 'The first VotingEvent on an Initiative';
        const initiativeAdministrator: Credentials = { userId: 'The mean Initiative Administrator' };
        let votingEventId: string;

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        // first clean the db
        mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true })
            // then start the test
            .pipe(
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.createInitiative, {
                        name: initiativeName,
                        administrator: initiativeAdmin,
                    }),
                ),
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
        const initiativeAdmin: User = { user: 'The admin of the the second initiative with a VotingEvent' };
        const votingEventName = 'The second VotingEvent on an Initiative';
        const initiativeAdministrator: Credentials = { userId: 'The nice Initiative Administrator' };
        let initiativeId: string;
        let votingEventId: string;

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        // first clean the db
        mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true })
            // then start the test
            .pipe(
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.createInitiative, {
                        name: initiativeName,
                        administrator: initiativeAdmin,
                    }),
                ),
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

describe('3 - administrators', () => {
    it('Create an initiative and add administrators', done => {
        const initiativeName = 'The initiative with some administrators';
        const initiativeAdmin: User = { user: 'The admin of The initiative with some administrators' };
        const administrators: User[] = [
            { user: 'Mary', roles: [INITIATIVE_ADMINISTRATOR] },
            { user: 'Kathy', roles: [INITIATIVE_ADMINISTRATOR] },
        ];

        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

        let headers;

        // first clean the db
        mongodbService(cachedDb, ServiceNames.cancelInitiative, { name: initiativeName, hard: true })
            // then start the test
            .pipe(
                concatMap(() =>
                    mongodbService(cachedDb, ServiceNames.createInitiative, {
                        name: initiativeName,
                        administrator: initiativeAdmin,
                    }),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getInititives)),
                map((initiatives: Initiative[]) => {
                    return initiatives.find(i => i.name === initiativeName);
                }),
                // authenticate as adiministrator of the event
                concatMap((initiative: Initiative) =>
                    mongodbService(cachedDb, ServiceNames.authenticateOrSetPwdIfFirstTime, {
                        user: initiativeAdmin.user,
                        pwd: 'initiativeAdminPwd',
                    }).pipe(
                        tap(resp => (headers = createHeaders(resp.token))),
                        map(() => initiative),
                    ),
                ),
                // add the new administrators
                concatMap((initiative: Initiative) =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.loadAdministratorsForInitiative,
                        {
                            name: initiative.name,
                            administrators,
                        },
                        null,
                        headers,
                    ),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getInititives)),
                map((initiatives: Initiative[]) => {
                    return initiatives.find(i => i.name === initiativeName);
                }),
                concatMap((initiative: Initiative) => {
                    const userColl = cachedDb.db.collection(config.usersCollection);
                    const selector = { initiativeId: initiative._id.toHexString() };
                    return findObs(userColl, selector);
                }),
                toArray(),
                tap((users: User[]) => {
                    expect(users).to.be.not.undefined;
                    // the newly added administrators have to be summed with the administrator set at Initiative creation time
                    expect(users.length).equal(administrators.length + 1);
                }),
                // add again the same administrators
                concatMap(() =>
                    mongodbService(
                        cachedDb,
                        ServiceNames.loadAdministratorsForInitiative,
                        {
                            name: initiativeName,
                            administrators,
                        },
                        null,
                        headers,
                    ),
                ),
                concatMap(() => mongodbService(cachedDb, ServiceNames.getInititives)),
                map((initiatives: Initiative[]) => {
                    return initiatives.find(i => i.name === initiativeName);
                }),
                concatMap((initiative: Initiative) => {
                    const userColl = cachedDb.db.collection(config.usersCollection);
                    const selector = { initiativeId: initiative._id.toHexString() };
                    return findObs(userColl, selector);
                }),
                toArray(),
                tap((users: User[]) => {
                    expect(users).to.be.not.undefined;
                    // the number of administrator should remain the same since the administrators just added were already
                    // administrators of this event and therefore are not added any more to the User collection
                    expect(users.length).equal(administrators.length + 1);
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
                    console.error(err);
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);
});
