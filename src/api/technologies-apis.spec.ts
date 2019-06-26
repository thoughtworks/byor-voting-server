import { expect } from 'chai';
import * as mango from 'observable-mongo';
import { from, of } from 'rxjs';
import * as sinon from 'sinon';
import { getTechnologies, getTechnology } from './technologies-apis';

describe('Technologies', () => {
    let sandbox;
    let obsMongo;
    let findObs;
    const collection: any = { collectionName: 'config' };

    const technologies = [{ sequence: 3, name: 'java' }, { sequence: 1, name: 'go' }, { sequence: 2, name: 'rust' }];

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        obsMongo = sandbox.mock(mango);

        findObs = obsMongo.expects('findObs');
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('get sorted list of technologies', () => {
        findObs
            .withArgs(collection)
            .once()
            .returns(from(technologies));

        getTechnologies(collection).subscribe(value => {
            const expected = {
                technologies: [technologies[1], technologies[2], technologies[0]],
            };
            expect(value).to.deep.equal(expected);
        });
        findObs.verify();
    });

    it('get one technology', () => {
        findObs
            .withArgs(collection)
            .once()
            .returns(of(technologies[1]));

        const name = technologies[1].name;
        getTechnology(collection, { name }).subscribe(value => {
            const expected = technologies[1];
            expect(value).to.deep.equal(expected);
        });
        findObs.verify();
    });

    it('get no technology since the name we search for does not exist', () => {
        findObs
            .withArgs(collection)
            .once()
            .returns(of(null));

        const name = 'blah';
        getTechnology(collection, { name }).subscribe(value => {
            const expected = null;
            expect(value).to.deep.equal(expected);
        });
        findObs.verify();
    });
});
