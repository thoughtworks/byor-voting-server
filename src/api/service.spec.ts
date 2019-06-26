import { expect } from 'chai';

import { mongodbService, isServiceKnown, mongodbServiceForTWBlips } from './service';
import { ServiceNames } from '../service-names';
import * as twBlipService from './tw-blips-collection-api';
import * as sinon from 'sinon';
import { of } from 'rxjs';

describe('Service', () => {
    describe('isServiceKnown', () => {
        it('returns true for known service', () => {
            expect(isServiceKnown(ServiceNames.calculateBlips)).to.be.true;
        });
    });

    describe('mongodbService', () => {
        it('calls a service which does not exist', () => {
            const cachedDb: any = {
                dbName: 'testDB',
                client: {
                    isConnected: () => true,
                },
                db: {
                    collection: () => ({ collectionName: 'testDB' }),
                },
            };

            mongodbService(cachedDb, 100).subscribe(
                () => {
                    expect.fail('Should throw error for service not found');
                },
                err => {
                    expect(err).to.exist;
                    expect(err.error).to.equal('Mongo Service 100 not defined');
                },
            );
        });
    });

    describe('mongodbServiceForTWBlips', () => {
        let findLatestEdition;
        let executeTwBlipsCollection;

        let sandbox: sinon.SinonSandbox;
        beforeEach(() => {
            sandbox = sinon.createSandbox();
            findLatestEdition = sandbox.stub(twBlipService, 'findLatestEdition');
            executeTwBlipsCollection = sandbox.stub(twBlipService, 'executeTwBlipsCollection');
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('should throw an error when mongodb could not connect to db', () => {
            const cachedDb: any = {
                dbName: 'testDB',
                client: {
                    isConnected: () => false,
                },
                db: {
                    collection: () => ({ collectionName: 'name' }),
                },
            };

            mongodbServiceForTWBlips(cachedDb, { timeout: 100 }).subscribe(
                () => {
                    expect.fail('Should throw error for service not found');
                },
                err => {
                    expect(err).to.exist;
                    expect(err).to.equal('Error while connecting to MongoDB');
                },
            );
        });

        it('should return tw latest blips', () => {
            let twBlips = [
                {
                    id: '35',
                    edition: '2019-04',
                    name: 'Productionizing Jupyter Notebooks',
                    quadrant: 'Techniques',
                    ring: 'Hold',
                    description: 'tw description',
                },
            ];
            findLatestEdition.returns(of(twBlips));
            executeTwBlipsCollection.returns(of(twBlips));

            const cachedDb: any = {
                dbName: 'testDB',
                client: {
                    isConnected: () => true,
                },
                db: {
                    collection: () => ({ collectionName: 'testDB' }),
                },
            };

            mongodbServiceForTWBlips(cachedDb, { timeout: 100 }).subscribe(result => {
                expect(result).to.lengthOf(1);
                expect(result[0].edition).to.equal('2019-04');
                expect(result[0].name).to.equal('Productionizing Jupyter Notebooks');
                expect(result[0].description).to.equal('tw description');
            });
            expect(executeTwBlipsCollection.called).to.true;
            expect(findLatestEdition.called).to.true;
        });
    });
});
