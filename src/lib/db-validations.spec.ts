import * as chai from 'chai';
import { mongoNestedFilter, correctedValue, findWrongValues$, performValidation$ } from './db-validations';
import { concatMap } from 'rxjs/operators';
import { config } from '../api/config';
import { of, from } from 'rxjs';
import { Db } from 'mongodb';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import * as mongo from 'observable-mongo';
import { connectObsMock } from './mocks';

chai.use(sinonChai);
const expect = chai.expect;

let sandbox: sinon.SinonSandbox;
let connectObs: sinon.SinonStub;
let aggregateObs: sinon.SinonStub;
let updateOneObs: sinon.SinonStub;

const quadrants = ['Tools', 'Platforms', 'Techniques', 'Languages & Frameworks'];
const rings = ['Adopt', 'Trial', 'Assess', 'hold'];

describe('mongoNestedFilter', () => {
    it("should create a pipeline for selecting invalid attribute' values", done => {
        expect(mongoNestedFilter('$quadrant', quadrants, [])).to.deep.equal([
            { $project: { _id: 1, value: '$quadrant' } },
            {
                $match: {
                    value: {
                        $not: {
                            $in: ['Tools', 'Platforms', 'Techniques', 'Languages & Frameworks'],
                        },
                    },
                },
            },
        ]);
        // done(err);
        done();
    });
    it("should create a pipeline for selecting invalid attribute' values for a nested array", done => {
        expect(mongoNestedFilter('$technologies.quadrant', quadrants, ['technologies'])).to.deep.equal([
            { $project: { _id: 1, technologies: 1 } },
            {
                $unwind: {
                    path: '$technologies',
                    includeArrayIndex: 'technologiesIndex',
                    preserveNullAndEmptyArrays: false,
                },
            },
            { $project: { _id: 1, value: '$technologies.quadrant', technologiesIndex: 1 } },
            {
                $match: {
                    value: {
                        $not: {
                            $in: ['Tools', 'Platforms', 'Techniques', 'Languages & Frameworks'],
                        },
                    },
                },
            },
        ]);
        // done(err);
        done();
    });
    it("should create a pipeline for selecting invalid attribute' values for a deep nested arrays (2 leveles)", done => {
        expect(mongoNestedFilter('$blips.votes.ring', rings, ['blips', 'votes'])).to.deep.equal([
            { $project: { _id: 1, blips: 1 } },
            {
                $unwind: {
                    path: '$blips',
                    includeArrayIndex: 'blipsIndex',
                    preserveNullAndEmptyArrays: false,
                },
            },
            { $project: { _id: 1, 'blips.votes': 1, blipsIndex: 1 } },
            {
                $unwind: {
                    path: '$blips.votes',
                    includeArrayIndex: 'votesIndex',
                    preserveNullAndEmptyArrays: false,
                },
            },
            { $project: { _id: 1, value: '$blips.votes.ring', blipsIndex: 1, votesIndex: 1 } },
            {
                $match: {
                    value: {
                        $not: {
                            $in: ['Adopt', 'Trial', 'Assess', 'hold'],
                        },
                    },
                },
            },
        ]);
        // done(err);
        done();
    });
    it("should create a pipeline for selecting invalid attribute' values for a deep nested arrays (3 leveles)", done => {
        expect(
            mongoNestedFilter('$blips.votes.comments.rating', ['x', 'xx', 'xxx'], ['blips', 'votes', 'comments']),
        ).to.deep.equal([
            { $project: { _id: 1, blips: 1 } },
            {
                $unwind: {
                    path: '$blips',
                    includeArrayIndex: 'blipsIndex',
                    preserveNullAndEmptyArrays: false,
                },
            },
            { $project: { _id: 1, 'blips.votes': 1, blipsIndex: 1 } },
            {
                $unwind: {
                    path: '$blips.votes',
                    includeArrayIndex: 'votesIndex',
                    preserveNullAndEmptyArrays: false,
                },
            },
            { $project: { _id: 1, 'blips.votes.comments': 1, blipsIndex: 1, votesIndex: 1 } },
            {
                $unwind: {
                    path: '$blips.votes.comments',
                    includeArrayIndex: 'commentsIndex',
                    preserveNullAndEmptyArrays: false,
                },
            },
            {
                $project: {
                    _id: 1,
                    value: '$blips.votes.comments.rating',
                    blipsIndex: 1,
                    votesIndex: 1,
                    commentsIndex: 1,
                },
            },
            {
                $match: {
                    value: {
                        $not: {
                            $in: ['x', 'xx', 'xxx'],
                        },
                    },
                },
            },
        ]);
        // done(err);
        done();
    });
});
describe('correctedValue', () => {
    it('should return the same value if no correction is available', done => {
        expect(correctedValue('tools1', quadrants)).to.equal('tools1');
        done();
    });
    it('should return a value with the correct uppercase letters if it matches a reference value', done => {
        expect(correctedValue('tools', quadrants)).to.equal('Tools');
        done();
    });
    it('should return null if the value is null', done => {
        expect(correctedValue(null, quadrants)).to.equal(null);
        done();
    });
});
describe('performValidation', () => {
    beforeEach(() => {
        sandbox = sinon.createSandbox();
        connectObs = sandbox.stub(mongo, 'connectObs');
        aggregateObs = sandbox.stub(mongo, 'aggregateObs');
        updateOneObs = sandbox.stub(mongo, 'updateOneObs');
        connectObs.returns(connectObsMock());
        aggregateObs.returns(from([{ _id: 'fixableId', value: 'tools' }, { _id: 'unfixableId', value: 'tools1' }]));
        updateOneObs.returns(of({}));
    });
    afterEach(() => {
        sandbox.restore();
    });
    it('should search for invalid values and log them', done => {
        of(1)
            .pipe(
                concatMap(() =>
                    findWrongValues$(
                        'technology.quadrant',
                        config.technologiesCollection,
                        quadrants,
                        [
                            { $project: { _id: 1, value: '$quadrant' } },
                            { $match: { value: { $not: { $in: quadrants } } } },
                        ],
                        false,
                    ),
                ),
            )
            .subscribe({
                next: result =>
                    expect(result.values).to.deep.eq({ _id: 'fixableId', value: 'tools', newValue: 'Tools' }),
                error: err => done(err),
                complete: () => done(),
            });
    });
    it('should search for unfixable values and log them', done => {
        of(1)
            .pipe(
                concatMap(() =>
                    findWrongValues$(
                        'technology.quadrant',
                        config.technologiesCollection,
                        quadrants,
                        [
                            { $project: { _id: 1, value: '$quadrant' } },
                            { $match: { value: { $not: { $in: quadrants } } } },
                        ],
                        true,
                    ),
                ),
            )
            .subscribe({
                next: result =>
                    expect(result.values).to.deep.eq({ _id: 'unfixableId', value: 'tools1', newValue: 'tools1' }),
                error: err => done(err),
                complete: () => done(),
            });
    });
    it('should search for unfixable values and raise an error', done => {
        performValidation$(
            'technology.quadrant',
            config.technologiesCollection,
            quadrants,
            [{ $project: { _id: 1, value: '$quadrant' } }, { $match: { value: { $not: { $in: quadrants } } } }],
            (foundItem: { db: Db; values: any }) => ({ quadrant: foundItem.values.newValue }),
            false,
            true,
        ).subscribe({
            next: null,
            error: err => {
                expect(err.message).to.be.equal('found 1 unfixable value(s)!');
                done();
            },
            complete: () => {
                done('unexpected to complete without raising errors!');
            },
        });
    });
    it('should update fixable values, and log their number', done => {
        performValidation$(
            'technology.quadrant',
            config.technologiesCollection,
            quadrants,
            [{ $project: { _id: 1, value: '$quadrant' } }, { $match: { value: { $not: { $in: quadrants } } } }],
            (foundItem: { db: Db; values: any }) => ({ quadrant: foundItem.values.newValue }),
            true,
            false,
        ).subscribe({
            next: null,
            error: err => done(err),
            complete: () => {
                expect(updateOneObs).to.have.been.calledWith(
                    { _id: 'fixableId' },
                    { quadrant: 'Tools' },
                    'technologies',
                );
                done();
            },
        });
    });
});
