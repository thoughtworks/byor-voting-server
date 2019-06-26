import { Vote } from './vote';
import { VoteCredentials } from './vote-credentials';
import { VoteCredentialized } from './vote-credentialized';

const oneTechnology = {
    id: '0003',
    name: 'Docker',
    quadrant: 'platoforms',
    isNew: false,
    description: 'Description of <strong>Docker</strong>',
};
const anotherTechnology = {
    id: '0003',
    name: 'Docker',
    quadrant: 'platoforms',
    isNew: false,
    description: 'Description of <strong>Docker</strong>',
};

const firstVoterCredentials: VoteCredentials = {
    votingEvent: { name: 'myEvent', _id: {}, round: 1 },
    voterId: { firstName: 'first', lastName: 'last' },
};
const secondVoterCredentials: VoteCredentials = {
    votingEvent: { name: 'mySecondEvent', _id: {}, round: 1 },
    voterId: { firstName: 'firstSecond', lastName: 'lastSecond' },
};

const votesFirst: Vote[] = [
    {
        voterId: { firstName: 'abc' },
        technology: oneTechnology,
        ring: 'Adopt',
        eventName: 'Event1',
        eventId: { id: 'e1' },
        eventRound: 1,
    },
    {
        voterId: { firstName: 'cde' },
        technology: anotherTechnology,
        ring: 'Hold',
        eventName: 'Event1',
        eventId: { id: 'e1' },
        eventRound: 1,
    },
];
const votesSecond: Vote[] = [
    {
        voterId: { firstName: 'abc' },
        technology: oneTechnology,
        ring: 'Adopt',
        eventName: 'Event1',
        eventId: { id: 'e1' },
        eventRound: 1,
    },
    {
        voterId: { firstName: 'cde' },
        technology: anotherTechnology,
        ring: 'Hold',
        eventName: 'Event1',
        eventId: { id: 'e1' },
        eventRound: 1,
    },
];

export const VOTES: VoteCredentialized[] = [
    { credentials: firstVoterCredentials, votes: votesFirst },
    { credentials: secondVoterCredentials, votes: votesSecond },
];
