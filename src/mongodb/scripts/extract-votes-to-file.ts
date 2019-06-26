import { CachedDB, mongodbService } from '../../api/service';
import { config } from '../../api/config';
import { ServiceNames } from '../../service-names';
import { map, switchMap, catchError, concatMap, tap, defaultIfEmpty, filter } from 'rxjs/operators';
import { VotingEvent } from '../../model/voting-event';
import { ObjectID } from 'bson';
import { Technology } from '../../model/technology';
import { appendFileObs, deleteFileObs } from 'observable-fs';
import { of, throwError, Observable, from } from 'rxjs';
import { logInfo } from '../../lib/utils';

const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

let technologies: Technology[];

export function extractVotesToFile(fileName: string, votingEventId?: string): Observable<any> {
    return deleteFileObs(fileName).pipe(
        catchError(error => {
            return error.code === 'ENOENT' ? of(null) : throwError(error);
        }),
        switchMap(() => mongodbService(cachedDb, ServiceNames.getTechnologies)),
        tap(techs => {
            technologies = techs.technologies;
        }),
        switchMap(() => mongodbService(cachedDb, ServiceNames.getVotingEvents)),
        switchMap(votingEvents => from(votingEvents)),
        filter(
            (vEvent: VotingEvent) =>
                vEvent._id.toHexString() === (votingEventId ? votingEventId : vEvent._id.toHexString()),
        ),
        map(votingEvent => ({ eventId: votingEvent._id as ObjectID, eventName: votingEvent.name })),
        tap(votingEvent => logInfo(votingEventId + ' - ' + votingEvent)),
        concatMap(votingEventData =>
            mongodbService(cachedDb, ServiceNames.getVotes, {
                eventId: votingEventData.eventId.toHexString(),
            }).pipe(
                concatMap(votes =>
                    from(
                        votes.map(v => {
                            const lastTechDefinition = technologies.find(tech => tech.name === v.technology.name);
                            const isNew = lastTechDefinition.isNew;
                            const voteLine = `${v.technology.name},${v.ring},${v.technology.quadrant},${isNew},${
                                votingEventData.eventName
                            }`;
                            return voteLine;
                        }),
                    ),
                ),
                defaultIfEmpty(''),
                concatMap(voteLine => appendFileObs(fileName, voteLine + '\n')),
            ),
        ),
    );
}
