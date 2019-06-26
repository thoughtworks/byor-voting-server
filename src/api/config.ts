export const config = {
    mongoUri: process.env['MONGO_URI'],
    mongoUriAdmin: process.env['MONGO_URI_ADMIN'],
    dbname: process.env['MONGO_DB_NAME'],
    jwtSecretKey: process.env['JWT_SECRET_KEY'] || 'TODO: set env variable for production envs',

    defautlTimeout: 5500,

    votingEventsCollection: 'votingevents',
    technologiesCollection: 'technologies',
    twBlipsCollection: 'tw_blips',
    votesCollection: 'votes',
    configurationCollection: 'configuration',
    usersCollection: 'users',
    logCollection: 'log',
    migrationsCollection: 'migrations',

    thresholdForRevote: 10,
};
