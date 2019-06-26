import { expect } from 'chai';
import { fillMissingBlips, formatCsvData, getBlips, sortByQuadrants } from './blips-service';
import { ServiceNames } from '../service-names';
import * as sinon from 'sinon';
import * as service from '../api/service';
import { of } from 'rxjs';

describe('blipService', () => {
    let mongodbService;
    let mongodbServiceForTWBlips;

    let sandbox: sinon.SinonSandbox;
    beforeEach(() => {
        sandbox = sinon.createSandbox();
        mongodbService = sandbox.stub(service, 'mongodbService');
        mongodbServiceForTWBlips = sandbox.stub(service, 'mongodbServiceForTWBlips');
        mongodbServiceForTWBlips.returns(of([]));
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('add tw blips description', () => {
        it('should add description when name of the blip is matching', function() {
            const cachedDb: any = {};

            let serviceResult = [
                {
                    name: 'Tools-Adopt-name',
                    ring: 'Adopt',
                    quadrant: 'Tools',
                    isNew: true,
                    description: 'description',
                },
            ];
            let twBlips = [
                {
                    name: 'Tools-Adopt-name',
                    ring: 'Adopt',
                    quadrant: 'Tools',
                    isNew: true,
                    description: '<p>tw description</p>',
                },
            ];

            mongodbService.returns(of(serviceResult));
            mongodbServiceForTWBlips.returns(of(twBlips));

            getBlips(cachedDb, ServiceNames.calculateBlipsFromAllEvents, {}, 'ipaddress').subscribe(result => {
                expect(result).to.equal(
                    'name,ring,quadrant,isNew,description\r\n"Tools-Adopt-name(*)","Adopt","Tools",true,"description<br><br><b>TW Tech Radar</b> Adopt <p>tw description</p>"\r\n"Not Available","Trial","Tools",false,"Not Available"\r\n"Not Available","Assess","Tools",false,"Not Available"\r\n"Not Available","Hold","Tools",false,"Not Available"\r\n"Not Available","Adopt","Techniques",false,"Not Available"\r\n"Not Available","Adopt","Platforms",false,"Not Available"\r\n"Not Available","Adopt","Languages & Frameworks",false,"Not Available"',
                );
            });
        });

        it('should remove quotes from description when name of the blip is matching', function() {
            const cachedDb: any = {};

            let serviceResult = [
                {
                    name: 'Tools-Adopt-name',
                    ring: 'Adopt',
                    quadrant: 'Tools',
                    isNew: true,
                    description: 'description',
                },
            ];
            let twBlips = [
                {
                    name: 'Tools-Adopt-name',
                    ring: 'Adopt',
                    quadrant: 'Tools',
                    isNew: true,
                    description: '<p><a href="blip-service.spec.ts">tw description</a></p>',
                },
            ];

            mongodbService.returns(of(serviceResult));
            mongodbServiceForTWBlips.returns(of(twBlips));

            getBlips(cachedDb, ServiceNames.calculateBlipsFromAllEvents, {}, 'ipaddress').subscribe(result => {
                expect(result).to.equal(
                    'name,ring,quadrant,isNew,description\r\n"Tools-Adopt-name(*)","Adopt","Tools",true,"description<br><br><b>TW Tech Radar</b> Adopt <p><a href=\'blip-service.spec.ts\'>tw description</a></p>"\r\n"Not Available","Trial","Tools",false,"Not Available"\r\n"Not Available","Assess","Tools",false,"Not Available"\r\n"Not Available","Hold","Tools",false,"Not Available"\r\n"Not Available","Adopt","Techniques",false,"Not Available"\r\n"Not Available","Adopt","Platforms",false,"Not Available"\r\n"Not Available","Adopt","Languages & Frameworks",false,"Not Available"',
                );
            });
        });

        it('should not add description when name of the blip is not matching', function() {
            const cachedDb: any = {};

            let serviceResult = [
                {
                    name: 'Tools-Adopt-name',
                    ring: 'Adopt',
                    quadrant: 'Tools',
                    isNew: true,
                    description: 'description',
                },
            ];
            let twBlips = [
                {
                    name: 'random-name',
                    ring: 'Adopt',
                    quadrant: 'Tools',
                    isNew: true,
                    description: '<p>tw description</p>',
                },
            ];

            mongodbService.returns(of(serviceResult));
            mongodbServiceForTWBlips.returns(of(twBlips));

            getBlips(cachedDb, ServiceNames.calculateBlipsFromAllEvents, {}, 'ipaddress').subscribe(result => {
                expect(result).to.equal(
                    'name,ring,quadrant,isNew,description\r\n"Tools-Adopt-name","Adopt","Tools",true,"description"\r\n"Not Available","Trial","Tools",false,"Not Available"\r\n"Not Available","Assess","Tools",false,"Not Available"\r\n"Not Available","Hold","Tools",false,"Not Available"\r\n"Not Available","Adopt","Techniques",false,"Not Available"\r\n"Not Available","Adopt","Platforms",false,"Not Available"\r\n"Not Available","Adopt","Languages & Frameworks",false,"Not Available"',
                );
            });
        });
    });

    describe('get all blips', () => {
        let serviceResult = [
            {
                name: 'Tools-Adopt-name',
                ring: 'Adopt',
                quadrant: 'Tools',
                isNew: true,
                description: 'description',
            },
            {
                name: 'Tools-Trial-name',
                ring: 'Trial',
                quadrant: 'Tools',
                isNew: true,
                description: 'description',
            },
            {
                name: 'Tools-Hold-name',
                ring: 'Hold',
                quadrant: 'Tools',
                isNew: true,
                description: 'description',
            },
            {
                name: 'Tools-Assess-name',
                ring: 'Assess',
                quadrant: 'Tools',
                isNew: true,
                description: 'description',
            },
            {
                name: 'Techniques-Trial-name',
                ring: 'Trial',
                quadrant: 'Techniques',
                isNew: true,
                description: 'description',
            },
            {
                name: 'Languages & Frameworks - Hold',
                ring: 'Hold',
                quadrant: 'Languages & Frameworks',
                isNew: true,
                description: 'description',
            },
            {
                name: 'Platforms-Assess-name',
                ring: 'Assess',
                quadrant: 'Platforms',
                isNew: true,
                description: 'description',
            },
        ];

        it('should get all the blips in csv format', function() {
            const cachedDb: any = {};
            mongodbService.returns(of(serviceResult));

            getBlips(cachedDb, ServiceNames.calculateBlipsFromAllEvents, {}, 'ipaddress').subscribe(result => {
                expect(result).to.equal(
                    'name,ring,quadrant,isNew,description\r\n"Tools-Adopt-name","Adopt","Tools",true,"description"\r\n"Tools-Trial-name","Trial","Tools",true,"description"\r\n"Tools-Assess-name","Assess","Tools",true,"description"\r\n"Tools-Hold-name","Hold","Tools",true,"description"\r\n"Techniques-Trial-name","Trial","Techniques",true,"description"\r\n"Platforms-Assess-name","Assess","Platforms",true,"description"\r\n"Languages & Frameworks - Hold","Hold","Languages & Frameworks",true,"description"',
                );
            });
        });
    });

    describe('formatCsvData', () => {
        it('should convert array json data to csv', () => {
            let serviceResult = [
                {
                    name: 'test-1',
                    ring: 'ring-1',
                    quadrant: 'quadrant-1',
                    isNew: true,
                    description: 'description-1',
                },
                {
                    name: 'test-2',
                    ring: 'ring-2',
                    quadrant: 'quadrant-2',
                    isNew: true,
                    description: 'description-2',
                },
            ];
            let serviceResponse = formatCsvData(serviceResult);
            expect(serviceResponse).to.equal(
                'name,ring,quadrant,isNew,description\r\n"test-1","ring-1","quadrant-1",true,"description-1"\r\n"test-2","ring-2","quadrant-2",true,"description-2"',
            );
        });

        it('should return empty scv string when result given as empty array', () => {
            let serviceResult = [];
            let serviceResponse = formatCsvData(serviceResult);
            expect(serviceResponse).to.equal('');
        });

        it('should return empty scv string when result is null', () => {
            let serviceResponse = formatCsvData(null);
            expect(serviceResponse).to.equal('');
        });
    });

    describe('sort blips', () => {
        it('should sort blips by quadrants', () => {
            const sortOrder = ['Tools', 'Techniques', 'Platforms', 'Languages & Frameworks'];

            let serviceResult = [
                {
                    name: 'test--Tools-1',
                    ring: 'ring-1',
                    quadrant: 'Tools',
                    isNew: true,
                    description: 'description-1',
                },
                {
                    name: 'test-Tools-2',
                    ring: 'ring-1',
                    quadrant: 'Tools',
                    isNew: true,
                    description: 'description-1',
                },
                {
                    name: 'test-2',
                    ring: 'ring-2',
                    quadrant: 'Techniques',
                    isNew: true,
                    description: 'description-2',
                },
                {
                    name: 'test-2',
                    ring: 'ring-2',
                    quadrant: 'Platforms',
                    isNew: true,
                    description: 'description-2',
                },
                {
                    name: 'test-2',
                    ring: 'ring-2',
                    quadrant: 'Languages & Frameworks',
                    isNew: true,
                    description: 'description-2',
                },
            ];

            const sortByQuadrantsResult = sortByQuadrants(serviceResult);
            expect(sortByQuadrantsResult).lengthOf(5);
            expect(sortByQuadrantsResult[0].quadrant).to.equal(sortOrder[0]);
            expect(sortByQuadrantsResult[1].quadrant).to.equal(sortOrder[0]);
            expect(sortByQuadrantsResult[2].quadrant).to.equal(sortOrder[1]);
            expect(sortByQuadrantsResult[3].quadrant).to.equal(sortOrder[2]);
            expect(sortByQuadrantsResult[4].quadrant).to.equal(sortOrder[3]);
        });

        it('should sort blips by ring in each ordered quadrant', () => {
            let serviceResult = [
                {
                    name: 'test-2',
                    ring: 'Assess',
                    quadrant: 'Techniques',
                    isNew: true,
                    description: 'description-2',
                },
                {
                    name: 'test--Tools-1',
                    ring: 'Trial',
                    quadrant: 'Tools',
                    isNew: true,
                    description: 'description-1',
                },
                {
                    name: 'test-Tools-2',
                    ring: 'Adopt',
                    quadrant: 'Tools',
                    isNew: true,
                    description: 'description-1',
                },
            ];

            const sortByQuadrantsResult = sortByQuadrants(serviceResult);
            expect(sortByQuadrantsResult).lengthOf(3);
            expect(sortByQuadrantsResult[0].quadrant).to.equal('Tools');
            expect(sortByQuadrantsResult[0].ring).to.equal('Adopt');

            expect(sortByQuadrantsResult[1].quadrant).to.equal('Tools');
            expect(sortByQuadrantsResult[1].ring).to.equal('Trial');

            expect(sortByQuadrantsResult[2].quadrant).to.equal('Techniques');
            expect(sortByQuadrantsResult[2].ring).to.equal('Assess');
        });

        it('should sort blips by vote in each ordered quadrant and sorted ring', () => {
            let serviceResult = [
                {
                    name: 'test-2',
                    ring: 'Assess',
                    quadrant: 'Techniques',
                    votes: 100,
                    isNew: true,
                    description: 'description-2',
                },
                {
                    name: 'Tools-Trial-with-120-votes',
                    ring: 'Trial',
                    quadrant: 'Tools',
                    votes: 120,
                    isNew: true,
                    description: 'description-120',
                },
                {
                    name: 'Tools-Trial-with-200-votes',
                    ring: 'Trial',
                    quadrant: 'Tools',
                    votes: 200,
                    isNew: true,
                    description: 'description-200',
                },
                {
                    name: 'test-Tools-2',
                    ring: 'Adopt',
                    quadrant: 'Tools',
                    votes: 120,
                    isNew: true,
                    description: 'description-1',
                },
            ];

            const sortByQuadrantsResult = sortByQuadrants(serviceResult);
            expect(sortByQuadrantsResult).lengthOf(4);
            expect(sortByQuadrantsResult[0].quadrant).to.equal('Tools');
            expect(sortByQuadrantsResult[0].ring).to.equal('Adopt');

            expect(sortByQuadrantsResult[1].quadrant).to.equal('Tools');
            expect(sortByQuadrantsResult[1].ring).to.equal('Trial');
            expect(sortByQuadrantsResult[1].name).to.equal('Tools-Trial-with-200-votes');

            expect(sortByQuadrantsResult[2].quadrant).to.equal('Tools');
            expect(sortByQuadrantsResult[2].ring).to.equal('Trial');
            expect(sortByQuadrantsResult[2].name).to.equal('Tools-Trial-with-120-votes');

            expect(sortByQuadrantsResult[3].quadrant).to.equal('Techniques');
            expect(sortByQuadrantsResult[3].ring).to.equal('Assess');
        });
    });

    describe('fill missing blips', () => {
        it('should fill missing quadrants and with all rings to one quadrant', () => {
            let serviceResult = [
                {
                    name: 'test--Tools-1',
                    ring: 'Adopt',
                    quadrant: 'Tools',
                    isNew: true,
                    description: 'description-1',
                },
                {
                    name: 'test-2',
                    ring: 'Hold',
                    quadrant: 'Techniques',
                    isNew: true,
                    description: 'description-2',
                },
            ];

            const result = fillMissingBlips(serviceResult);
            expect(result).lengthOf(6);
        });

        it('should not fill any ring when all quadrants and rings are available', () => {
            let serviceResult = [
                {
                    name: 'Tools-Adopt-name',
                    ring: 'Adopt',
                    quadrant: 'Tools',
                    isNew: true,
                    description: 'description',
                },
                {
                    name: 'Tools-Trial-name',
                    ring: 'Trial',
                    quadrant: 'Tools',
                    isNew: true,
                    description: 'description',
                },
                {
                    name: 'Tools-Hold-name',
                    ring: 'Hold',
                    quadrant: 'Tools',
                    isNew: true,
                    description: 'description',
                },
                {
                    name: 'Tools-Assess-name',
                    ring: 'Assess',
                    quadrant: 'Tools',
                    isNew: true,
                    description: 'description',
                },
                {
                    name: 'Techniques-Trial-name',
                    ring: 'Trial',
                    quadrant: 'Techniques',
                    isNew: true,
                    description: 'description',
                },
                {
                    name: 'Languages & Frameworks - Hold',
                    ring: 'Hold',
                    quadrant: 'Languages & Frameworks',
                    isNew: true,
                    description: 'description',
                },
                {
                    name: 'Platforms-Assess-name',
                    ring: 'Assess',
                    quadrant: 'Platforms',
                    isNew: true,
                    description: 'description',
                },
            ];

            const result = fillMissingBlips(serviceResult);
            expect(result).lengthOf(7);
        });

        it('should fill missing rings when all quadrant are available and rings are missing', () => {
            let serviceResult = [
                {
                    name: 'Tools-Adopt-name',
                    ring: 'Adopt',
                    quadrant: 'Tools',
                    isNew: true,
                    description: 'description',
                },
                {
                    name: 'Techniques-Trial-name',
                    ring: 'Trial',
                    quadrant: 'Techniques',
                    isNew: true,
                    description: 'description',
                },
                {
                    name: 'Languages & Frameworks - Adopt',
                    ring: 'Adopt',
                    quadrant: 'Languages & Frameworks',
                    isNew: true,
                    description: 'description',
                },
                {
                    name: 'Platforms-Adopt-name',
                    ring: 'Adopt',
                    quadrant: 'Platforms',
                    isNew: true,
                    description: 'description',
                },
            ];

            const result = fillMissingBlips(serviceResult);
            expect(result).lengthOf(6);
        });

        it('should fill missing quadrants and all rings to only one quadrant', () => {
            let serviceResult = [
                {
                    name: 'Tools-Adopt',
                    ring: 'Adopt',
                    quadrant: 'Tools',
                    isNew: true,
                    description: 'description-1',
                },
            ];

            const result = fillMissingBlips(serviceResult);
            expect(result).lengthOf(7);
        });
    });
});
