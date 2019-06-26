interface ServiceResponse {
    serviceName: string;
    statusCode: number;
    data?: any;
    error?: any;
}

export function buildError(serviceName: string, error: any, _statusCode?: number) {
    const code = _statusCode ? _statusCode : 300;
    let _error: any = {};
    if (error.message && error.stack) {
        _error['message'] = error.message;
        _error['stack'] = error.stack;
    } else {
        _error = error;
    }
    return buildResponse(serviceName, code, null, _error);
}

export function buildResponse(serviceName: string, statusCode: number, serviceResult?: any, error?: any) {
    const response: ServiceResponse = {
        serviceName,
        statusCode,
        data: serviceResult,
        error,
    };
    return response;
}
