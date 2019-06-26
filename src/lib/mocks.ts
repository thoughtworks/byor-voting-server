import { of } from 'rxjs';

export const connectObsMock = () => {
    return of({
        db: () => {
            return {
                collection: collectionName => {
                    return collectionName;
                },
            };
        },
        close: () => {},
    });
};

export const validatePasswordAgainstHash = (password: string, passwordHash: string) => {
    return of(password == passwordHash);
};

export const generateJwt = (payload, expiresIn = 300) => {
    return of(payload.toString() + expiresIn.toString());
};
