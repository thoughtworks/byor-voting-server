import { concatMap, tap, map, finalize } from 'rxjs/operators';
import { mongodbService, CachedDB } from '../api/service';
import { config } from '../api/config';
import { MongoClient } from 'mongodb';
import { connectObs, updateOneObs } from 'observable-mongo';
import { ServiceNames } from '../service-names';
import { VotingEvent } from '../model/voting-event';
import { CorporateVotingEventFlow, CORPORATE_VOTING_EVENT_TAGS } from './corporate-voting-event-flow';
import { CommunityVotingEventFlow } from './community-voting-event-flow';
import { Credentials } from '../model/credentials';
import { VoteCredentialized } from '../model/vote-credentialized';

const cachedDb: CachedDB = { dbName: config.dbname, client: null, db: null };

const corporateEvent: VotingEvent = {
    name: 'A Corporate Event',
    flow: CorporateVotingEventFlow,
    creator: { userId: 'the setupper' },
};
const communityEvent: VotingEvent = {
    name: 'A Community Event',
    flow: CommunityVotingEventFlow,
    creator: { userId: 'the setupper' },
};

const kent: Credentials = { nickname: 'Kent' };
const martin: Credentials = { nickname: 'Martin' };

const initialize = (dbName: string) => {
    let mongoClient: MongoClient;
    return connectObs(config.mongoUri).pipe(
        tap(client => (mongoClient = client)),
        map(client => client.db(dbName)),
        finalize(() => mongoClient.close()),
    );
};

initialize(cachedDb.dbName)
    .pipe(
        concatMap(() =>
            mongodbService(cachedDb, ServiceNames.cancelVotingEvent, { name: corporateEvent.name, hard: true }),
        ),
        concatMap(() =>
            mongodbService(cachedDb, ServiceNames.cancelVotingEvent, { name: communityEvent.name, hard: true }),
        ),

        // Corporate Event
        concatMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, corporateEvent)),
        concatMap(_id => mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id }).pipe(map(() => _id))),
        concatMap(_id => mongodbService(cachedDb, ServiceNames.getVotingEvent, { _id })),
        concatMap((votingEvent: VotingEvent) => {
            const tech0 = { ...votingEvent.technologies[0] };
            tech0._id = (tech0._id as any).toHexString();
            const tech1 = { ...votingEvent.technologies[1] };
            tech1._id = (tech1._id as any).toHexString();
            const eventName = votingEvent.name;
            const eventId = votingEvent._id.toHexString();
            const kentVotes: VoteCredentialized = {
                credentials: { votingEvent: { name: eventName, _id: eventId, round: 1 }, voterId: kent },
                votes: [
                    {
                        technology: tech0,
                        ring: 'adopt',
                        eventRound: 1,
                        comment: { text: 'Awesome' },
                        tags: [CORPORATE_VOTING_EVENT_TAGS[0], CORPORATE_VOTING_EVENT_TAGS[1]],
                    },
                    {
                        technology: tech1,
                        ring: 'hold',
                        eventRound: 1,
                        comment: { text: 'Crap, Garbage' },
                        tags: [CORPORATE_VOTING_EVENT_TAGS[0], CORPORATE_VOTING_EVENT_TAGS[2]],
                    },
                ],
            };
            return mongodbService(cachedDb, ServiceNames.saveVotes, kentVotes).pipe(map(() => votingEvent));
        }),
        concatMap((votingEvent: VotingEvent) => {
            const tech0 = { ...votingEvent.technologies[0] };
            tech0._id = (tech0._id as any).toHexString();
            const tech1 = { ...votingEvent.technologies[1] };
            tech1._id = (tech1._id as any).toHexString();
            const eventName = votingEvent.name;
            const eventId = votingEvent._id.toHexString();
            const martinVotes: VoteCredentialized = {
                credentials: {
                    votingEvent: { name: eventName, _id: eventId, round: 1 },
                    voterId: martin,
                },
                votes: [
                    {
                        technology: tech0,
                        ring: 'adopt',
                        eventRound: 1,
                        comment: { text: 'This is really really Bad' },
                        tags: [
                            CORPORATE_VOTING_EVENT_TAGS[0],
                            CORPORATE_VOTING_EVENT_TAGS[2],
                            CORPORATE_VOTING_EVENT_TAGS[1],
                        ],
                    },
                    {
                        technology: tech1,
                        ring: 'adopt',
                        eventRound: 1,
                        comment: { text: 'This is going to change the world for the good' },
                        tags: [CORPORATE_VOTING_EVENT_TAGS[0], CORPORATE_VOTING_EVENT_TAGS[1]],
                    },
                ],
            };
            return mongodbService(cachedDb, ServiceNames.saveVotes, martinVotes).pipe(map(() => votingEvent));
        }),

        // Community Event
        concatMap(() => mongodbService(cachedDb, ServiceNames.createVotingEvent, communityEvent)),
        concatMap(_id => mongodbService(cachedDb, ServiceNames.openVotingEvent, { _id })),
        concatMap(() =>
            updateOneObs(
                { user: { $exists: false } },
                { 'config.enableVotingEventFlow': true },
                cachedDb.db.collection(config.configurationCollection),
                { upsert: true },
            ),
        ),
    )
    .subscribe(
        null,
        err => {
            cachedDb.client.close();
            console.error(err);
        },
        () => {
            cachedDb.client.close();
        },
    );
