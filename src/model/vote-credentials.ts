import { Credentials } from './credentials';

export interface VoteCredentials {
    voterId: { firstName: string; lastName: string } | Credentials;
    votingEvent: { name: string; _id: any; round: any };
}
