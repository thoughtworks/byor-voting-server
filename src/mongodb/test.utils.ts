export function createHeaders(token: string) {
    const tokenForHeader = 'Bearer ' + token;
    const headers = {
        authorization: tokenForHeader,
    };
    return headers;
}
