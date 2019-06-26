import { expect } from 'chai';

import { switchMap, tap, map, catchError } from 'rxjs/operators';
import { InsertOneWriteOpResult } from 'mongodb';

import { mongodbService, CachedDB } from '../api/service';
import { config } from '../api/config';
import { ServiceNames } from '../service-names';
import { Technology } from '../model/technology';
import { of } from 'rxjs';

describe('CRUD operations on Techonologies collection', () => {
    it('loads the technologies and then read them, add a new tech', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        let numberOfInsertedItems = 0;
        let name: string;
        let newTech: Technology;
        let updateTechData: any;
        let techToCancel: any;
        let techToRestore: any;
        let techToDelete: any;
        mongodbService(cachedDb, ServiceNames.deleteTechnologies)
            .pipe(
                switchMap(() => mongodbService(cachedDb, ServiceNames.loadTechnologies)),
                tap(result => {
                    const resultInsert: InsertOneWriteOpResult = result.result;
                    numberOfInsertedItems = resultInsert.insertedCount;
                }),
                // read all technologies
                switchMap(() => mongodbService(cachedDb, ServiceNames.getTechnologies)),
                map(data => data.technologies),
                tap(technologies => {
                    expect(technologies.length).to.equal(numberOfInsertedItems);
                }),
                // read one technology using name as key
                switchMap(technologies => {
                    name = technologies[0].name;
                    return mongodbService(cachedDb, ServiceNames.getTechnology, { name });
                }),
                tap(technology => {
                    expect(technology).to.be.not.null;
                    expect(technology.name).to.equal(name);
                }),
                // try to read one technology which does not exist in the DB
                switchMap(() => {
                    const name = 'blah';
                    return mongodbService(cachedDb, ServiceNames.getTechnology, { name });
                }),
                tap(technology => {
                    expect(technology).to.be.null;
                }),
                // add one technology
                switchMap(() => {
                    newTech = {
                        name: 'New Tech',
                        description: 'A new shiny technology',
                        isNew: true,
                        quadrant: 'tools',
                    };
                    return mongodbService(cachedDb, ServiceNames.addTechnology, { technology: newTech });
                }),
                switchMap(() => {
                    return mongodbService(cachedDb, ServiceNames.getTechnology, { name: newTech.name });
                }),
                tap(technology => {
                    expect(technology.description).to.equal(newTech.description);
                }),
                // try to add a tech already present
                switchMap(() => {
                    return mongodbService(cachedDb, ServiceNames.addTechnology, { technology: newTech }).pipe(
                        catchError(err => {
                            expect(err).to.be.not.null;
                            return of(null);
                        }),
                    );
                }),
                tap(data => {
                    // this expectation is to make sure, indirectly, that the function specified as parameter of the catchError
                    // operator has been executed - if that function is executed, the value returned is null
                    expect(data).to.be.null;
                }),
                // try to update the name of a tech already present
                switchMap(() => {
                    return mongodbService(cachedDb, ServiceNames.getTechnology, { name: newTech.name });
                }),
                switchMap(technology => {
                    updateTechData = { _id: technology._id, name: 'The New Tech name' };
                    return mongodbService(cachedDb, ServiceNames.updateTechnology, { technology: updateTechData });
                }),
                switchMap(() => {
                    return mongodbService(cachedDb, ServiceNames.getTechnology, { name: updateTechData.name });
                }),
                tap(technology => {
                    expect(technology.name).to.equal(updateTechData.name);
                    expect(technology.description).to.equal(newTech.description);
                    expect(technology.lastUpdatedTS).to.be.not.null;
                }),
                // cancel a technology already present
                switchMap(technology => {
                    techToCancel = technology;
                    return mongodbService(cachedDb, ServiceNames.cancelTechnology, { id: technology._id });
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getTechnology, { name: techToCancel.name })),
                tap(technology => {
                    expect(technology).to.be.null;
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getTechnologies, { readAll: true })),
                map(data => data.technologies),
                tap(technologies => {
                    expect(technologies.find(tech => tech.name === techToCancel.name).name).to.equal(techToCancel.name);
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getTechnologies)),
                map(data => data.technologies),
                tap(technologies => {
                    expect(technologies.filter(tech => tech.name === techToCancel.name).length).to.equal(0);
                }),
                // restore a cancelled technology
                switchMap(() => mongodbService(cachedDb, ServiceNames.getTechnologies, { readAll: true })),
                map(data => data.technologies),
                map(technologies => technologies.find(tech => tech.cancelled)),
                tap(technology => (techToRestore = technology)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.restoreTechnology, { id: techToRestore._id })),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getTechnology, { name: techToRestore.name })),
                tap(technology => {
                    expect(technology.description).to.equal(techToRestore.description);
                }),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getTechnologies)),
                map(data => data.technologies),
                map(technologies => technologies.find(tech => tech.name === techToRestore.name)),
                tap(technology => {
                    expect(technology.description).to.equal(techToRestore.description);
                }),
                // delete a technology already present
                tap(() => (techToDelete = techToCancel)),
                switchMap(() => mongodbService(cachedDb, ServiceNames.deleteTechnology, { _id: techToDelete._id })),
                switchMap(() => mongodbService(cachedDb, ServiceNames.getTechnologies, { readAll: true })),
                map(data => data.technologies),
                map(technologies => technologies.filter(tech => tech.name === techToDelete.name)),
                tap(technologies => {
                    expect(technologies.length).to.equal(0);
                }),
            )
            .subscribe(
                null,
                err => {
                    cachedDb.client.close();
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    }).timeout(10000);
});
