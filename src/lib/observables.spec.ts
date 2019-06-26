import * as chai from 'chai';
import { concatMap, map } from 'rxjs/operators';
import { of } from 'rxjs';
import * as sinonChai from 'sinon-chai';
import { getPasswordHash$, validatePasswordAgainstHash$, generateJwt$, verifyJwt$, verifyJwt } from './observables';
import { validatePasswordAgainstHash } from './mocks';

chai.use(sinonChai);
const expect = chai.expect;

let password: string;
let passwordHash: string;

describe('password hashing-mock', () => {
    it('should return true if the password is equal to the hash', done => {
        validatePasswordAgainstHash('aaa', 'aaa').subscribe({
            next: isValid => expect(isValid).to.true,
            error: err => done(err),
            complete: () => done(),
        });
    });
    it('should return false if the password is not equal to the hash', done => {
        validatePasswordAgainstHash('aaa', 'aaa1').subscribe({
            next: isValid => expect(isValid).to.false,
            error: err => done(err),
            complete: () => done(),
        });
    });
});

describe('password hashing', () => {
    beforeEach(() => {
        password = 'asd';
        passwordHash =
            '3fb67c8b512d8ce73324db02dda2d19ebfb9d6a923c48fb503be3e0c7c752eb84e4da0818665133a27638dce8e9e8696a51b64b6b247354764609f22b4e65d35';
    });
    it('should generate a hash from a password', done => {
        of(1)
            .pipe(concatMap(() => getPasswordHash$(password)))
            .subscribe({
                next: (hash: string) => expect(hash).to.eq(passwordHash),
                error: err => done(err),
                complete: () => done(),
            });
    });
    it('should validate that a password matches against a hash', done => {
        of(1)
            .pipe(concatMap(() => validatePasswordAgainstHash$(password, passwordHash)))
            .subscribe({
                next: isValid => expect(isValid).to.true,
                error: err => done(err),
                complete: () => done(),
            });
    });
    it('should validate that a wrong password does not match against a hash', done => {
        const wrongPassword = 'qwe';
        of(1)
            .pipe(concatMap(() => validatePasswordAgainstHash$(wrongPassword, passwordHash)))
            .subscribe({
                next: isValid => expect(isValid).to.false,
                error: err => done(err),
                complete: () => done(),
            });
    });
});

let expectedPayload: any;
let options: any;

describe('jwt', () => {
    beforeEach(() => {
        expectedPayload = { foo: 'bar' };
        options = {};
    });
    it('should generate a jwt from a payload', done => {
        of(1)
            .pipe(concatMap(() => generateJwt$(expectedPayload)))
            .subscribe({
                next: (token: string) => expect(token).to.be.string,
                error: err => done(err),
                complete: () => done(),
            });
    });
    it('should verify a jwt is untempered', done => {
        of(1)
            .pipe(
                concatMap(() => generateJwt$(expectedPayload)),
                concatMap((token: string) => verifyJwt$(token, options)),
            )
            .subscribe({
                next: payload => expect(payload['foo']).to.deep.equal('bar'),
                error: err => done(err),
                complete: () => done(),
            });
    });
    it('should verify a jwt has been expired', done => {
        of(1)
            .pipe(
                concatMap(() => generateJwt$(expectedPayload, 0)),
                concatMap((token: string) => verifyJwt$(token, options)),
            )
            .subscribe({
                next: null,
                error: err => {
                    expect(err.message).to.be.equal('jwt expired');
                    done();
                },
                complete: () => done(),
            });
    });
});

describe('jwt-syncronized', () => {
    beforeEach(() => {
        expectedPayload = { foo: 'bar' };
        options = {};
    });
    it('should verify a jwt is untempered', done => {
        of(1)
            .pipe(
                concatMap(() => generateJwt$(expectedPayload)),
                map((token: string) => verifyJwt(token)),
            )
            .subscribe({
                next: payload => expect(payload['foo']).to.deep.equal('bar'),
                error: err => done(err),
                complete: () => done(),
            });
    });
    it('should verify a jwt has been expired', done => {
        of(1)
            .pipe(
                concatMap(() => generateJwt$(expectedPayload, 0)),
                map((token: string) => verifyJwt(token)),
            )
            .subscribe({
                next: null,
                error: err => {
                    expect(err.message).to.be.equal('jwt expired');
                    done();
                },
                complete: () => done(),
            });
    });
});
