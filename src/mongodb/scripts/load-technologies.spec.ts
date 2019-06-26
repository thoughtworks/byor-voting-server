import { expect } from 'chai';
import { loadTechnologies } from './load-technologies';
import { switchMap, map } from 'rxjs/operators';
import { mongodbService, CachedDB } from '../../api/service';
import { config } from '../../api/config';
import { ServiceNames } from '../../service-names';

describe('Script load technologies from spreadsheet', () => {
    it('should load from input technologies', done => {
        const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };
        const inputTechnologies = [
            {
                name: 'Some',
                quadrant: 'Tools',
                isNew: 'TRUE',
            },
            {
                name: 'Another',
                quadrant: 'Techniques',
                isNew: 'FALSE',
            },
            {
                name: 'One more',
                quadrant: 'Tools',
                isNew: 'TRUE',
            },
        ];
        loadTechnologies(inputTechnologies)
            .pipe(
                switchMap(() => mongodbService(cachedDb, ServiceNames.getTechnologies)),
                map(data => data.technologies),
                map(loadedTechnologies =>
                    loadedTechnologies.map(t => ({
                        name: t.name,
                        quadrant: t.quadrant,
                        isNew: t.isNew,
                    })),
                ),
            )
            .subscribe(
                loadedTechnologies => {
                    expect(loadedTechnologies.length).to.equal(inputTechnologies.length);
                    expect(loadedTechnologies).to.deep.include.members([
                        {
                            name: 'Some',
                            quadrant: 'Tools',
                            isNew: 'TRUE',
                        },
                        {
                            name: 'Another',
                            quadrant: 'Techniques',
                            isNew: 'FALSE',
                        },
                        {
                            name: 'One more',
                            quadrant: 'Tools',
                            isNew: 'TRUE',
                        },
                    ]);
                },
                err => {
                    cachedDb.client.close();
                    done(err);
                },
                () => {
                    cachedDb.client.close();
                    done();
                },
            );
    });
});
