import { expect } from 'chai';
import * as mango from 'observable-mongo';
import {
    cancelVotingEvent,
    closeForRevote,
    closeVotingEvent,
    createNewVotingEvent,
    deleteVotingEvents,
    getAllVotingEvents,
    // getVoters,
    getVotingEvent,
    getVotingEvents,
    laodVotingEvents,
    openForRevote,
    openVotingEvent,
    saveVotingEvents,
} from './voting-event-apis';
import { from, of, EMPTY, Observable } from 'rxjs';
import * as sinon from 'sinon';
import { ObjectId } from 'mongodb';
import { VotingEvent } from '../model/voting-event';

describe('Voting Events API', () => {
    let sandbox;
    let findObs;
    let dropObs;
    let insertManyObs;
    let updateOneObs;
    let deleteObs;
    let updateManyObs;

    const collection: any = { collectionName: 'voting-events' };
    const selector = { cancelled: { $exists: false } };
    const options = { projection: { blips: 0, technologies: 0 } };

    const votingEvents: VotingEvent[] = [
        {
            _id: new ObjectId('000000000000000000000000'),
            name: 'devoox',
            status: 'open',
            round: 1,
            creationTS: '2019-02-14T14:08:10.410Z',
            creator: { userId: 'the creator' },
        },
        {
            _id: new ObjectId('111111111111111111111111'),
            name: 'codemotion',
            status: 'closed',
            creationTS: '2019-02-12T14:08:10.410Z',
            creator: { userId: 'the creator' },
        },
        {
            _id: new ObjectId('222222222222222222222222'),
            name: 'devoox',
            status: 'open',
            creationTS: '2019-02-16T14:08:10.410Z',
            creator: { userId: 'the creator' },
        },
        {
            _id: new ObjectId('333333333333333333333333'),
            name: 'codemotion',
            status: 'closed',
            creationTS: '2019-02-08T14:08:10.410Z',
            creator: { userId: 'the creator' },
        },
    ];

    before(() => {
        sandbox = sinon.createSandbox();
        findObs = sandbox.stub(mango, 'findObs');
        dropObs = sandbox.stub(mango, 'dropObs');
        insertManyObs = sandbox.stub(mango, 'insertManyObs');
        updateOneObs = sandbox.stub(mango, 'updateOneObs');
        deleteObs = sandbox.stub(mango, 'deleteObs');
        updateManyObs = sandbox.stub(mango, 'updateManyObs');

        findObs.returns(from(votingEvents));
        dropObs.returns(EMPTY);
        insertManyObs.returns(of([1]));
        updateOneObs.returns(from([{ result: { ok: 1, n: 1 } }]));
        deleteObs.returns(of(1));
    });

    after(() => {
        sandbox.restore();
    });

    describe('getVotingEvents', () => {
        it('returns sorted voting events', () => {
            // TODO: check why sort is not working and then sort the data in assertion
            getVotingEvents(collection).subscribe(events => {
                expect(events.length).to.equal(4);

                expect(events[0].name).to.equal('devoox');
                expect(events[0].creationTS).to.equal('2019-02-14T14:08:10.410Z');

                expect(events[1].name).to.equal('codemotion');
                expect(events[1].creationTS).to.equal('2019-02-12T14:08:10.410Z');

                expect(events[2].name).to.equal('devoox');
                expect(events[2].creationTS).to.equal('2019-02-16T14:08:10.410Z');

                expect(events[3].name).to.equal('codemotion');
                expect(events[3].creationTS).to.equal('2019-02-08T14:08:10.410Z');
            });
            sinon.assert.calledWith(findObs, collection, selector, options);
        });

        it('uses empty options on full data', () => {
            // TODO: check why sort is not working and then sort the data in assertion
            getVotingEvents(collection, { full: true }).subscribe(events => {
                expect(events.length).to.equal(4);
            });
            sinon.assert.calledWith(findObs, collection, selector, {});
        });
    });

    describe('getVotingEvent', () => {
        const id = new ObjectId('000000000000000000000000');
        const selector = { $or: [{ cancelled: { $exists: false } }, { cancelled: false }], _id: id };

        it('gets the first event for id', () => {
            getVotingEvent(collection, id).subscribe(event => {
                expect(event.name).to.equal(votingEvents[0].name);
                expect(event.creationTS).to.equal(votingEvents[0].creationTS);
            });
            sinon.assert.calledWith(findObs, collection, selector);
        });

        it('tries to get an event with a wrong formatted id', () => {
            let nextSubscribeCalled = false;
            let errorSubscribeCalled = false;
            getVotingEvent(collection, '123456').subscribe(
                () => {
                    nextSubscribeCalled = true;
                },
                () => {
                    errorSubscribeCalled = true;
                },
            );
            expect(nextSubscribeCalled).to.be.false;
            expect(errorSubscribeCalled).to.be.true;
            sinon.assert.calledWith(findObs, collection, selector);
        });
    });

    describe('getAllVotingEvents', () => {
        it('gets all the voting events ', () => {
            getAllVotingEvents(collection).subscribe(events => {
                expect(events.length).to.equal(4);

                expect(events[0].name).to.equal('devoox');
                expect(events[0].creationTS).to.equal('2019-02-14T14:08:10.410Z');

                expect(events[1].name).to.equal('codemotion');
                expect(events[1].creationTS).to.equal('2019-02-12T14:08:10.410Z');

                expect(events[2].name).to.equal('devoox');
                expect(events[2].creationTS).to.equal('2019-02-16T14:08:10.410Z');

                expect(events[3].name).to.equal('codemotion');
                expect(events[3].creationTS).to.equal('2019-02-08T14:08:10.410Z');
            });

            sinon.assert.calledWith(findObs, collection);
        });
    });

    describe('laodVotingEvents', () => {
        it('loads the events voting data', () => {
            let insertedVotes = [];
            const mongoCollection = {
                ...collection,
                insertMany: docs => {
                    insertedVotes = docs;
                },
            };

            laodVotingEvents(mongoCollection, votingEvents).subscribe(() => {
                expect(insertedVotes).to.equal(votingEvents);
            });
            sinon.assert.calledWith(dropObs, mongoCollection);
        });
    });

    describe('deleteVotingEvents', () => {
        it('drops the collection', () => {
            deleteVotingEvents(collection).subscribe();
            sinon.assert.calledWith(dropObs, collection);
        });
    });

    describe('saveVotingEvents', () => {
        let insertManyObsErr;

        beforeEach(() => {
            insertManyObs.restore();
        });

        afterEach(() => {
            insertManyObsErr.restore();
            insertManyObs = sandbox.stub(mango, 'insertManyObs').returns(EMPTY);
        });

        it('saves the voting events', () => {
            insertManyObsErr = sandbox.stub(mango, 'insertManyObs').returns(EMPTY);
            saveVotingEvents(collection, votingEvents).subscribe(a => a);
            sinon.assert.calledWith(insertManyObsErr, votingEvents, collection);
        });

        it('returns error for voting event already present', () => {
            const errorObs = new Observable(subscriber => {
                subscriber.error({ code: 11000 });
            });
            insertManyObsErr = sandbox.stub(mango, 'insertManyObs').returns(errorObs);

            saveVotingEvents(collection, votingEvents).subscribe(
                () => {
                    expect.fail('should not be called');
                },
                err => {
                    expect(err.message).to.equal('voting event already present');
                },
            );
            sinon.assert.calledWith(insertManyObsErr, votingEvents, collection);
        });

        it('returns error for voting event already present', () => {
            const errorObs = new Observable(subscriber => {
                subscriber.error({ code: 2200, message: 'cannot connect to db' });
            });
            insertManyObsErr = sandbox.stub(mango, 'insertManyObs').returns(errorObs);

            saveVotingEvents(collection, votingEvents).subscribe(
                () => {
                    expect.fail('should not be called');
                },
                err => {
                    expect(err.message).to.equal('cannot connect to db');
                },
            );
            sinon.assert.calledWith(insertManyObsErr, votingEvents, collection);
        });
    });

    describe('createNewVotingEvent', () => {
        it('creates a new voting event', () => {
            createNewVotingEvent(collection, {
                name: 'Ng-Conf',
                flow: null,
                creator: { userId: 'the creator' },
            }).subscribe(id => {
                expect(id).to.equal(1);
            });
            sinon.assert.calledWith(insertManyObs, sinon.match.array, collection);
        });
    });

    describe('openVotingEvent', () => {
        const techCollection: any = { collectionName: 'technologies' };
        it('opens an event for voting', () => {
            const votingEvent = { _id: votingEvents[0]._id };
            findObs.onCall(1).returns(EMPTY);
            openVotingEvent(collection, techCollection, votingEvent).subscribe(id => {
                expect(id).to.deep.equal({ result: { ok: 1, n: 1 } });
            });
            sinon.assert.calledWith(updateOneObs, votingEvent, sinon.match.has('status', 'open'), collection);
        });
    });

    describe('closeVotingEvent', () => {
        it('closes the event for voting', () => {
            let votingEvent = { _id: '000000000000000000000000' };
            closeVotingEvent(collection, votingEvent).subscribe(id => {
                expect(id).to.deep.equal({ result: { ok: 1, n: 1 } });
            });
            sinon.assert.calledWith(updateOneObs, sinon.match.any, sinon.match.has('status', 'closed'), collection);
        });
    });

    describe('openForRevote', () => {
        it('opens the event for re-voting', () => {
            let votingEvent = { _id: '000000000000000000000000', round: 1 };
            openForRevote(collection, votingEvent).subscribe(result => {
                expect(result).to.deep.equal({ result: { ok: 1, n: 1 } });
            });
            sinon.assert.calledWith(updateOneObs, sinon.match.any, sinon.match.has('openForRevote', true), collection);
            sinon.assert.calledWith(updateOneObs, sinon.match.any, sinon.match.has('round', 2), collection);
        });

        it('throws error when the round does not match', () => {
            updateOneObs.resetHistory();
            let votingEvent = { _id: '000000000000000000000000', round: 3 };
            openForRevote(collection, votingEvent).subscribe(
                () => {
                    expect.fail();
                },
                err => {
                    expect(err).to.equal(
                        'Voting event with id 000000000000000000000000 is not at round 3. It can not be openForRevote.',
                    );
                },
            );
            expect(updateOneObs.called).to.false;
        });
    });

    describe('closeForRevote', () => {
        it('closes the event for re-voting', () => {
            let votingEvent = { _id: '000000000000000000000000' };
            closeForRevote(collection, votingEvent).subscribe(id => {
                expect(id).to.deep.equal({ result: { ok: 1, n: 1 } });
            });
            sinon.assert.calledWith(updateOneObs, sinon.match.any, sinon.match.has('openForRevote', false), collection);
        });
    });

    describe('cancelVotingEvent', () => {
        let votesCollection: any = { collectionName: 'votes' };
        it('cancels the voting event', () => {
            const params = { _id: votingEvents[0]._id, hard: true };
            deleteObs.withArgs({ _id: params._id }, collection).returns(of(4));
            deleteObs.withArgs({ eventId: params._id }, votesCollection).returns(of(5));
            cancelVotingEvent(collection, votesCollection, params).subscribe(value => {
                expect(value).to.deep.equal([4, 5]);
            });
        });

        it('cancels the voting event', () => {
            const params = { _id: votingEvents[0]._id };
            updateManyObs.withArgs({ _id: params._id }, { cancelled: true }, collection).returns(of(3));
            updateManyObs.withArgs({ eventId: params._id }, { cancelled: true }, votesCollection).returns(of(4));
            cancelVotingEvent(collection, votesCollection, params).subscribe(value => {
                expect(value).to.deep.equal([3, 4]);
            });
        });
    });

    // I need to delete this test since now the "getVotes" api requires an eventId as property of the params and
    // this test assumes that there is no such property in the params object passed
    // describe('getVoters', () => {
    //     const votesCollection: any = { collectionName: 'votes' };
    //     const votes = [
    //         { voterId: { firstName: 'abc', lastName: 'def' } },
    //         { voterId: { firstName: 'abc', lastName: 'bcf' } },
    //         { voterId: { firstName: 'def', lastName: 'rgh' } },
    //         { voterId: { firstName: 'abc', lastName: 'def' } },
    //     ];
    //     it('closes the event for voting', () => {
    //         const params = { votingEvent: votingEvents[0] };
    //         findObs.withArgs(votesCollection, { cancelled: { $exists: false },  }).returns(from(votes));

    //         getVoters(votesCollection, params).subscribe(value => {
    //             expect(value).to.deep.equal(['abc def', 'abc bcf', 'def rgh']);
    //         });
    //     });
    // });

    describe('calculateWinner', () => {
        it('closes the event for voting', () => {
            // TODO: Write test
        });
    });
});
