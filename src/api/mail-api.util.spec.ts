import { expect } from 'chai';
import { isEmailValid } from './mail-api.util';

describe.only('When checking email format', () => {
    it('it responds FALSE if the format is not valid', () => {
        const invalidEmail = 'abc@abc';
        expect(isEmailValid(invalidEmail)).to.be.false;
        console.log(isEmailValid(invalidEmail));
    });

    it('it responds TRUE if the format is valid', () => {
        const validEmail = 'abc@abc.com';
        expect(isEmailValid(validEmail)).to.be.true;
        console.log(isEmailValid(validEmail));
    });
});
