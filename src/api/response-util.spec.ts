import { expect } from 'chai';
import { buildResponse, buildError } from './response-util';

describe('responseUtils', () => {
    describe('buildResponse', () => {
        it('build the service response for the given params', () => {
            let serviceResult = [];
            let serviceResponse = buildResponse('serviceName', 200, serviceResult, null);
            expect(serviceResponse.data).to.deep.equal(serviceResult);
            expect(serviceResponse.error).to.null;
            expect(serviceResponse.serviceName).to.equal('serviceName');
            expect(serviceResponse.statusCode).to.equal(200);
        });
    });

    describe('buildError', () => {
        it('should build error with default error code when no status code given ', () => {
            let serviceResponse = buildError('serviceName', 'default');
            expect(serviceResponse.data).to.null;
            expect(serviceResponse.error).to.eq('default');
            expect(serviceResponse.serviceName).to.equal('serviceName');
            expect(serviceResponse.statusCode).to.equal(300);
        });

        it('should build service error object', () => {
            let serviceError = {
                message: 'error message',
                stack: 'stack error',
            };
            let serviceResponse = buildError('serviceName', serviceError, 500);
            expect(serviceResponse.data).to.null;
            expect(serviceResponse.error.message).to.eq('error message');
            expect(serviceResponse.error.stack).to.eq('stack error');
            expect(serviceResponse.serviceName).to.equal('serviceName');
            expect(serviceResponse.statusCode).to.equal(500);
        });

        it('should not build error message and stack when only msg given', () => {
            let serviceError = {
                message: 'error message',
            };
            let serviceResponse = buildError('serviceName', serviceError, 500);
            expect(serviceResponse.error.message).to.eq('error message');
        });
    });
});
