import { expect } from 'chai';
import * as mango from 'observable-mongo';
import { authenticate, validateRequestAuthentication } from './authentication-api';
import { of, EMPTY } from 'rxjs';
import * as sinon from 'sinon';
import { validatePasswordAgainstHash } from '../lib/mocks';
import * as observable from '../lib/observables';
import * as jwtDecode from 'jwt-decode';

describe('Authentication', () => {
    let sandbox;
    let obsMongo;
    let findObs;
    let validatePasswordAgainstHash$;
    const collection: any = { collectionName: 'users' };

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        obsMongo = sandbox.mock(mango);
        findObs = obsMongo.expects('findObs');
        validatePasswordAgainstHash$ = sandbox.stub(observable, 'validatePasswordAgainstHash$');
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('on valid user from collection', () => {
        it('authenticates the user', () => {
            const expectedPayload = { user: 'abc', roles: ['admin'] };
            validatePasswordAgainstHash$.returns(validatePasswordAgainstHash('pwd', 'pwd'));
            findObs.once().returns(of({ ...expectedPayload, pwd: 'pwd' }));
            authenticate(collection, { ...expectedPayload, pwd: 'pwd' }).subscribe(token => {
                expect(jwtDecode(token).roles).to.be.deep.eq(expectedPayload.roles);
            });
            findObs.verify();
        });
    });

    describe('on invalid credentials', () => {
        it(`returns 'user not known' error on wrong username`, () => {
            let user1 = { user: 'abc', pwd: '123' };
            findObs.once().returns(EMPTY);
            authenticate(collection, user1).subscribe(
                value => {
                    expect.fail(value, 'none', '');
                },
                error => {
                    expect(error.message).to.equal('user not known');
                },
            );
            findObs.verify();
        });

        it(`returns 'password not valid' error on wrong password`, () => {
            findObs.once().returns(of({ user: 'abc', pwd: 'pwd' }));
            validatePasswordAgainstHash$.returns(validatePasswordAgainstHash('pwd', '456'));
            authenticate(collection, { user: 'abc', pwd: '456' }).subscribe(
                value => {
                    expect.fail(value, 'none', '');
                },
                error => {
                    expect(error.message).to.equal('password not valid');
                },
            );
            findObs.verify();
        });
    });

    describe('validate request authentication', () => {
        it('should throw error when headers does not have authorization token', function() {
            const headers = {};
            try {
                validateRequestAuthentication(headers);
                expect.fail('Expected to throw error');
            } catch (error) {
                expect(error.message).to.equal('Auth token is not supplied');
            }
        });

        it('should throw error when authorization token is not valid', function() {
            sandbox.stub(observable, 'verifyJwt').throws('invalid token');
            const headers = {
                authorization: 'Bearer 123456',
            };
            try {
                validateRequestAuthentication(headers);
                expect.fail('Expected to throw error');
            } catch (error) {
                expect(error.message).to.equal('Token is not valid');
            }
        });

        it('should return token when authorization token is valid', function() {
            sandbox.stub(observable, 'verifyJwt').returns('123456');
            const headers = {
                authorization: 'Bearer 123456',
            };
            const token = validateRequestAuthentication(headers);
            expect(token).be.equal('123456');
        });
    });
});
