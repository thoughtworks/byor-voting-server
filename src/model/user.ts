export const INITIATIVE_ADMINISTRATOR = 'initiative_administrator';
export const EVENT_ADMINISTRATOR = 'event_administrator';
export type UserRole = 'administrator' | 'initiative_administrator' | 'event_administrator';

export interface User {
    user: string;
    initiativeId?: string;
    initiativeName?: string;
    votingEventId?: string;
    votingEventName?: string;
    roles?: UserRole[];
    groups?: string[];
}
