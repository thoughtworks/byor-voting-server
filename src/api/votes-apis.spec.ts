import { expect } from 'chai';
import * as mango from 'observable-mongo';
import { from, of } from 'rxjs';
import * as sinon from 'sinon';
import {
    aggregateVotes,
    calculateBlips,
    calculateBlipsFromAllEvents,
    deleteVotes,
    getAllVotes,
    getVotes,
    hasAlreadyVoted,
    saveVotes,
} from './votes-apis';
import { ObjectId } from 'bson';
import { Vote } from '../model/vote';
import { AggregatedVote } from '../model/aggregated-vote';

const assert = sinon.assert;

describe('Votes', () => {
    let sandbox: sinon.SinonSandbox;
    let findObs: sinon.SinonStub;
    let dropObs: sinon.SinonStub;
    let insertManyObs: sinon.SinonStub;
    let aggregateObs: sinon.SinonStub;
    let updateOneObs: sinon.SinonStub;

    const votesCollection: any = { collectionName: 'votes' };
    const votingCollection: any = { collectionName: 'voting-events' };

    const technologies = [
        { quadrant: 'tools', name: 'K8s', id: 'abcd', isNew: false, description: 'desc' },
        { quadrant: 'tools', name: 'Angular', id: 'def', isNew: false, description: 'desc' },
        { quadrant: 'languages & frameworks', name: 'Rust', id: 'agh', isNew: false, description: 'desc' },
        { quadrant: 'Platforms', name: 'Cobol', id: 'cob', isNew: false, description: 'desc' },
        { quadrant: 'Techniques', name: 'Lisp', id: 'lis', isNew: false, description: 'desc' },
    ];
    const voterId = { firstName: 'Dynamic', lastName: 'Mango', ipAddress: '10.20.144.212' };
    const votes: Vote[] = [
        {
            technology: technologies[2],
            ring: 'assess',
            eventName: 'codemotion',
            eventRound: 2,
        },
        {
            technology: technologies[1],
            ring: 'adopt',
            eventName: 'ng-conf',
            eventRound: 1,
        },
        {
            technology: technologies[0],
            ring: 'adopt',
            eventName: 'cloud-conf',
            eventRound: 1,
        },
    ];

    const objectId = new ObjectId('000000000000000000000000');
    const votingEvent = {
        _id: objectId,
        name: 'codemotion',
        status: 'open',
        round: 1,
        creationTS: '2019-02-14T14:08:10.410Z',
    };

    const aggregatedResult: AggregatedVote[] = [
        {
            count: 3,
            technology: 'k8s',
            quadrant: 'tools',
            isNew: true,
            votesForRing: [
                {
                    count: 2,
                    ring: 'adopt',
                    votesForEvent: [{ id: '123', eventName: 'e1', count: 1 }, { id: '124', eventName: 'e2', count: 1 }],
                },
                {
                    count: 1,
                    ring: 'hold',
                    votesForEvent: [{ id: '123', eventName: 'e1', count: 1 }],
                },
            ],
        },
        {
            count: 1,
            technology: 'rust',
            quadrant: 'languages & frameworks',
            isNew: true,
            votesForRing: [
                {
                    count: 2,
                    ring: 'assess',
                    votesForEvent: [{ id: '126', eventName: 'e1', count: 1 }],
                },
            ],
        },
    ];

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        findObs = sandbox.stub(mango, 'findObs');
        dropObs = sandbox.stub(mango, 'dropObs');
        insertManyObs = sandbox.stub(mango, 'insertManyObs');
        aggregateObs = sandbox.stub(mango, 'aggregateObs');
        updateOneObs = sandbox.stub(mango, 'updateOneObs');

        findObs.returns(from(votes));
        dropObs.returns(of({ ok: true }));
        insertManyObs.returns(from([1001]));
        aggregateObs.returns(from(aggregatedResult));
        updateOneObs.returns(of({ upsertedId: { _id: objectId } }));
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getVotes', () => {
        it('when called without id gets all the votes', () => {
            getVotes(votesCollection).subscribe(
                value => {
                    expect(value).to.deep.equal(votes);
                },
                err => {
                    expect.fail('Should not raise any error', err);
                },
            );
            assert.calledWith(findObs, votesCollection, { cancelled: { $exists: false } });
        });
        it('when called with string id gets the votes for that id', () => {
            getVotes(votesCollection, { eventId: 'abc123' }).subscribe(
                value => {
                    expect(value).to.deep.equal(votes);
                },
                err => {
                    expect.fail('Should not raise any error', err);
                },
            );
            assert.calledWith(findObs, votesCollection, { cancelled: { $exists: false }, eventId: 'abc123' });
        });
        it('when called with id object gets the votes for that id', () => {
            getVotes(votesCollection, { eventId: '123ef' }).subscribe(
                value => {
                    expect(value).to.deep.equal(votes);
                },
                err => {
                    expect.fail('Should not raise any error', err);
                },
            );
            assert.calledWith(findObs, votesCollection, { cancelled: { $exists: false }, eventId: '123ef' });
        });
    });

    describe('getAllVotes', () => {
        it('gets all the votes', () => {
            getAllVotes(votesCollection).subscribe(
                value => {
                    expect(value).to.deep.equal(votes);
                },
                err => {
                    expect.fail('Should not raise any error', err);
                },
            );
            assert.calledWith(findObs, votesCollection);
        });
    });

    describe('deleteVotes', () => {
        it('deletes the votes collection', () => {
            deleteVotes(votesCollection).subscribe(
                value => {
                    expect(value.result.ok).to.be.true;
                },
                err => {
                    expect.fail('Should not raise any error', err);
                },
            );
            assert.calledWith(dropObs, votesCollection);
        });
    });

    describe('hasAlreadyVoted', () => {
        it('returns false when the user has not voted', () => {
            findObs.onCall(1).returns(of(votingEvent));

            const credObj = { credentials: { voterId: voterId, votingEvent: votingEvent } };
            hasAlreadyVoted(votesCollection, votingCollection, credObj).subscribe(value => {
                expect(value).to.be.false;
            });
            assert.calledTwice(findObs);
            assert.calledWith(findObs, votesCollection);
        });
        it('returns false when there are no votes', () => {
            findObs.onCall(0).returns(from([]));
            findObs.onCall(1).returns(of(votingEvent));

            const credObj = { credentials: { voterId: voterId, votingEvent: votingEvent } };
            hasAlreadyVoted(votesCollection, votingCollection, credObj).subscribe(
                value => {
                    expect(value).to.be.false;
                },
                err => {
                    expect.fail('Should not raise any error', err);
                },
            );
            assert.calledTwice(findObs);
            assert.calledWith(findObs, votesCollection);
        });
        it('returns true when the user has voted', () => {
            findObs.onCall(1).returns(of({ ...votingEvent, round: 2 }));

            const credObj = { credentials: { voterId: voterId, votingEvent: votingEvent } };
            hasAlreadyVoted(votesCollection, votingCollection, credObj).subscribe(
                value => {
                    expect(value).to.be.true;
                },
                err => {
                    expect.fail('Should not raise any error', err);
                },
            );
            assert.calledTwice(findObs);
            assert.calledWith(findObs, votesCollection);
        });
    });

    describe('saveVotes', () => {
        const credObj = { credentials: { voterId: voterId, votingEvent: votingEvent }, votes: votes };
        it('saves the vote for the user', () => {
            findObs.onCall(0).returns(of(votingEvent));
            findObs.onCall(2).returns(of(votingEvent));
            saveVotes(votesCollection, votingCollection, credObj, '10.20.10.10').subscribe(
                value => {
                    expect(value).to.equal(1001);
                },
                err => {
                    expect.fail('Should not raise any error', err);
                },
            );
        });
    });

    describe('aggregateVotes', () => {
        it('provides the aggregations to mongo', () => {
            const vEvent: any = votingEvent;
            aggregateVotes(votesCollection, { votingEvent: vEvent }).subscribe(
                value => {
                    expect(value.length).to.deep.equal(2);

                    expect(value[0].count).to.equal(3);
                    expect(value[0].technology).to.equal('k8s');
                    expect(value[1].count).to.equal(1);
                    expect(value[1].technology).to.equal('rust');
                },
                err => {
                    expect.fail('Should not raise any error', err);
                },
            );
            assert.calledWith(aggregateObs, votesCollection);
        });
        it('provides the aggregations without event-id ', () => {
            aggregateVotes(votesCollection).subscribe(
                value => {
                    expect(value[0].count).to.equal(3);
                    expect(value[0].technology).to.equal('k8s');
                    expect(value[1].count).to.equal(1);
                    expect(value[1].technology).to.equal('rust');
                },
                err => {
                    expect.fail('Should not raise any error', err);
                },
            );
            assert.calledWith(aggregateObs, votesCollection);
        });
    });

    describe('calculateBlips', () => {
        it('calculates the blips', () => {
            const params: any = {
                votingEvent: votingEvent,
                thresholdForRevote: 0,
            };

            findObs.onCall(0).returns(of({ ...votingEvent, technologies }));
            calculateBlips(votesCollection, votingCollection, params).subscribe(
                value => {
                    expect(value.length).to.equal(2);

                    expect(value[0].description).to.equal(
                        '<strong>Votes: 3</strong><br><br><i><strong><b>Selected by: </b></strong></i><br>ADOPT (2)<br><i><strong><b>Other ratings: </b></strong></i><br>HOLD (1)',
                    );
                    expect(value[0].isNew).to.be.true;
                    expect(value[0].name).to.equal('k8s');
                    expect(value[0].number).to.equal(0);
                    expect(value[0].numberOfVotes).to.equal(3);
                    expect(value[0].quadrant).to.equal('tools');
                    expect(value[0].ring).to.equal('adopt');

                    expect(value[1].description).to.equal(
                        '<strong>Votes: 1</strong><br><br><i><strong><b>Selected by: </b></strong></i><br>ASSESS (2)<br>',
                    );
                    expect(value[1].isNew).to.be.true;
                    expect(value[1].name).to.equal('rust');
                    expect(value[1].number).to.equal(1);
                    expect(value[1].numberOfVotes).to.equal(1);
                    expect(value[1].quadrant).to.equal('languages & frameworks');
                    expect(value[1].ring).to.equal('assess');
                },
                err => {
                    expect.fail('Should not raise any error', err);
                },
            );

            assert.calledOnce(findObs);
            assert.calledWith(findObs, votingCollection, {
                _id: objectId,
                $or: [{ cancelled: { $exists: false } }, { cancelled: false }],
            });
            assert.calledOnce(aggregateObs);
            assert.calledOnce(updateOneObs);
        });

        it('should throw an error when votingEvent not given in params', () => {
            const params: any = {
                thresholdForRevote: 0,
            };

            calculateBlips(votesCollection, votingCollection, params).subscribe(
                () => {},
                err => {
                    expect(err).to.be.not.undefined;
                },
            );
        });

        it('identifies blips for re-vote', () => {
            const params: any = {
                votingEvent: votingEvent,
                thresholdForRevote: 10,
            };

            const aggregateForRevote: AggregatedVote[] = [
                {
                    count: 18,
                    technology: 'k8s',
                    quadrant: 'tools',
                    isNew: true,
                    votesForRing: [
                        {
                            count: 7,
                            ring: 'assess',
                            votesForEvent: [
                                { id: '112', eventName: 'e1', count: 4 },
                                { id: '113', eventName: 'e2', count: 3 },
                            ],
                        },
                        {
                            count: 6,
                            ring: 'adopt',
                            votesForEvent: [
                                { id: '112', eventName: 'e1', count: 3 },
                                { id: '113', eventName: 'e2', count: 3 },
                            ],
                        },
                        {
                            count: 5,
                            ring: 'hold',
                            votesForEvent: [{ id: '114', eventName: 'e1', count: 1 }],
                        },
                    ],
                },
            ];

            aggregateObs.returns(from(aggregateForRevote));
            findObs.onCall(0).returns(of({ ...votingEvent, technologies }));
            calculateBlips(votesCollection, votingCollection, params).subscribe(value => {
                expect(value.length).to.equal(1);
                expect(value[0].forRevote).to.be.true;
                expect(value[0].isNew).to.be.true;
                expect(value[0].name).to.equal('k8s');
                expect(value[0].number).to.equal(0);
                expect(value[0].numberOfVotes).to.equal(18);
                expect(value[0].quadrant).to.equal('tools');
                expect(value[0].ring).to.equal('assess');
                expect(value[0].description).to.equal(
                    '<strong>Votes: 18</strong><br><br><i><strong><b>Selected by: </b></strong></i><br>ASSESS (7)<br><i><strong><b>Other ratings: </b></strong></i><br>ADOPT (6)<br>HOLD (5)',
                );
            });

            assert.calledOnce(findObs);
            assert.calledWith(findObs, votingCollection, {
                _id: objectId,
                $or: [{ cancelled: { $exists: false } }, { cancelled: false }],
            });
            assert.calledOnce(aggregateObs);
            assert.calledOnce(updateOneObs);
        });
    });

    describe('calculateBlipsFromAllEvents', () => {
        it('calculates the values for blips', () => {
            const aggregatedResultForAllEvents: AggregatedVote[] = [
                {
                    count: 3,
                    technology: 'k8s',
                    quadrant: 'tools',
                    isNew: true,
                    votesForRing: [
                        {
                            count: 2,
                            ring: 'adopt',
                            votesForEvent: [
                                { id: '123', eventName: 'e1', count: 1 },
                                { id: '124', eventName: 'e2', count: 1 },
                            ],
                        },
                        { count: 1, ring: 'hold', votesForEvent: [{ id: '125', eventName: 'e1', count: 1 }] },
                    ],
                },
                {
                    count: 1,
                    technology: 'rust',
                    quadrant: 'languages & frameworks',
                    isNew: true,
                    votesForRing: [
                        { count: 2, ring: 'assess', votesForEvent: [{ id: '126', eventName: 'e1', count: 1 }] },
                    ],
                },
            ];

            aggregateObs.returns(from(aggregatedResultForAllEvents));

            const params = {
                radarUrl: 'http://radarUrl:8080/',
                baseUrl: 'http://baseUrl:3000/',
                votingEvent: { _id: 1 },
                thresholdForRevote: 20,
            };

            calculateBlipsFromAllEvents(votesCollection, params).subscribe(
                value => {
                    expect(value.length).to.equal(2);

                    expect(value[0].description).to.equal(
                        "<strong>Votes: 3</strong><br><br><i><strong><b>Selected by: </b></strong></i><li><a href='http://radarUrl:8080/?title=e1&sheetId=http%3A%2F%2FbaseUrl%3A3000%2Fvotes%2F123%2Fblips.csv%3FthresholdForRevote%3D20%26type%3Dcsv' target='_blank'/>e1(1)</li><li><a href='http://radarUrl:8080/?title=e2&sheetId=http%3A%2F%2FbaseUrl%3A3000%2Fvotes%2F124%2Fblips.csv%3FthresholdForRevote%3D20%26type%3Dcsv' target='_blank'/>e2(1)</li><br><i><strong><b>Other ratings: </b></strong></i><li><a href='http://radarUrl:8080/?title=e1&sheetId=http%3A%2F%2FbaseUrl%3A3000%2Fvotes%2F125%2Fblips.csv%3FthresholdForRevote%3D20%26type%3Dcsv' target='_blank'/>e1(1)</li>",
                    );
                    expect(value[0].isNew).to.be.true;
                    expect(value[0].name).to.equal('k8s');
                    expect(value[0].number).to.equal(0);
                    expect(value[0].numberOfVotes).to.equal(3);
                    expect(value[0].quadrant).to.equal('tools');
                    expect(value[0].ring).to.equal('adopt');

                    expect(value[1].description).to.equal(
                        "<strong>Votes: 1</strong><br><br><i><strong><b>Selected by: </b></strong></i><li><a href='http://radarUrl:8080/?title=e1&sheetId=http%3A%2F%2FbaseUrl%3A3000%2Fvotes%2F126%2Fblips.csv%3FthresholdForRevote%3D20%26type%3Dcsv' target='_blank'/>e1(1)</li><br>",
                    );
                    expect(value[1].isNew).to.be.true;
                    expect(value[1].name).to.equal('rust');
                    expect(value[1].number).to.equal(1);
                    expect(value[1].numberOfVotes).to.equal(1);
                    expect(value[1].quadrant).to.equal('languages & frameworks');
                    expect(value[1].ring).to.equal('assess');
                },
                err => {
                    expect.fail('Should not raise any error', err);
                },
            );
            assert.calledOnce(aggregateObs);
        });

        it('should not add a tag to event name when params are not present', () => {
            const aggregatedResult: AggregatedVote[] = [
                {
                    count: 3,
                    technology: 'k8s',
                    quadrant: 'tools',
                    isNew: true,
                    votesForRing: [
                        {
                            count: 2,
                            ring: 'adopt',
                            votesForEvent: [
                                { id: '123', eventName: 'e1', count: 1 },
                                { id: '124', eventName: 'e2', count: 1 },
                            ],
                        },
                        { count: 1, ring: 'hold', votesForEvent: [{ id: '125', eventName: 'e1', count: 1 }] },
                    ],
                },
            ];

            aggregateObs.returns(from(aggregatedResult));

            calculateBlipsFromAllEvents(votesCollection, {}).subscribe(
                value => {
                    expect(value.length).to.equal(1);

                    expect(value[0].description).to.equal(
                        '<strong>Votes: 3</strong><br><br><i><strong><b>Selected by: </b></strong></i><li>e1(1)</li><li>e2(1)</li><br><i><strong><b>Other ratings: </b></strong></i><li>e1(1)</li>',
                    );
                },
                err => {
                    expect.fail('Should not raise any error', err);
                },
            );
            assert.calledOnce(aggregateObs);
        });
    });
});
