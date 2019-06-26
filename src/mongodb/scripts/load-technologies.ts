import { Observable, from } from 'rxjs';
import { switchMap, toArray } from 'rxjs/operators';
import { config } from '../../api/config';
import { ServiceNames } from '../../service-names';
import { CachedDB, mongodbService } from '../../api/service';

const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

export function loadTechnologies(dataset): Observable<any> {
    return from(dataset).pipe(
        toArray(),
        switchMap(technologies => mongodbService(cachedDb, ServiceNames.loadTechnologies, technologies)),
    );
}
