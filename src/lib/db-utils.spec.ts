import * as chai from 'chai';
import { concatMap } from 'rxjs/operators';
import { config } from '../api/config';
import { of, from } from 'rxjs';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import * as mongo from 'observable-mongo';
import { connectObsMock } from './mocks';
import { findAndUpdateDoc$ } from './db-utils';
import { ObjectID } from 'mongodb';

chai.use(sinonChai);
const expect = chai.expect;

let sandbox: sinon.SinonSandbox;
let connectObs: sinon.SinonStub;
let findObs: sinon.SinonStub;
let updateOneObs: sinon.SinonStub;
let findCriteria: any;

describe('findAndUpdateDoc$', () => {
    beforeEach(() => {
        sandbox = sinon.createSandbox();
        connectObs = sandbox.stub(mongo, 'connectObs');
        findObs = sandbox.stub(mongo, 'findObs');
        updateOneObs = sandbox.stub(mongo, 'updateOneObs');
        connectObs.returns(connectObsMock());
        updateOneObs.returns(of({}));
        findCriteria = { user: 'abc' };
    });
    afterEach(() => {
        sandbox.restore();
    });
    it('should search for a doc and update it', done => {
        findObs.returns(from([{ _id: '5d0caf005dd0eb0032c67c2e', user: 'abc', pwd: 'oldHash' }]));
        of(1)
            .pipe(
                concatMap(() =>
                    findAndUpdateDoc$(config.usersCollection, findCriteria, () => {
                        return { user: 'def', pwd: 'hash' };
                    }),
                ),
            )
            .subscribe({
                next: null,
                error: err => done(err),
                complete: () => {
                    expect(findObs).to.have.been.calledWith('users', findCriteria);
                    expect(updateOneObs).to.have.been.calledWith(
                        { _id: new ObjectID('5d0caf005dd0eb0032c67c2e') },
                        { user: 'def', pwd: 'hash' },
                        'users',
                    );
                    done();
                },
            });
    });
    it('should search for a doc and if it is not found do nothing', done => {
        const wrongFindCriteria = { user: 'xyz' };
        findObs.returns(from([]));
        of(1)
            .pipe(
                concatMap(() =>
                    findAndUpdateDoc$(config.usersCollection, wrongFindCriteria, () => {
                        return { user: 'def', pwd: 'hash' };
                    }),
                ),
            )
            .subscribe({
                next: null,
                error: err => done(err),
                complete: () => {
                    expect(findObs).to.have.been.calledWith('users', wrongFindCriteria);
                    expect(updateOneObs).to.not.have.been.called;
                    done();
                },
            });
    });
});
