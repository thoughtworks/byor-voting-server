import { expect } from 'chai';
import * as mango from 'observable-mongo';
import { from } from 'rxjs';
import * as sinon from 'sinon';
import { getConfiguration } from './configuration-apis';

describe('Configuration', () => {
    let sandbox;
    let obsMongo;
    let findObs;
    const collection: any = { collectionName: 'config' };

    const configs = [{ config: { property1: 'abc', property2: 'cdf' } }];

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        obsMongo = sandbox.mock(mango);

        findObs = obsMongo.expects('findObs');
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('get the merged configuration', () => {
        findObs
            .withArgs(collection, { user: { $exists: false } })
            .once()
            .returns(from(configs));

        getConfiguration(collection).subscribe(value => {
            const expectedConfig = {
                property1: 'abc',
                property2: 'cdf',
            };
            expect(value).to.deep.equal(expectedConfig);
        });
        findObs.verify();
    });

    it('provides user to the config call', () => {
        const configs = [
            { config: { property1: 'abc', property2: 'cdf' } },
            { user: 'abc', config: { property3: 'cdf', property4: 'abc' } },
        ];

        findObs
            .withArgs(collection, { $or: [{ user: 'abc' }, { user: { $exists: false } }] })
            .once()
            .returns(from(configs));

        getConfiguration(collection, { user: 'abc' }).subscribe(value => {
            const expectedConfig = {
                property1: 'abc',
                property2: 'cdf',
                property3: 'cdf',
                property4: 'abc',
            };
            expect(value).to.deep.equal(expectedConfig);
        });
        findObs.verify();
    });
});
