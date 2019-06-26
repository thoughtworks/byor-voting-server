import { Observable, Observer, TeardownLogic, OperatorFunction } from 'rxjs';
import { tap, map, concatMap, share, take, finalize } from 'rxjs/operators';
import * as _ from 'underscore';

import * as fs from 'fs';
import * as readline from 'readline';

import { logTrace } from './utils';

export const readLineObs$ = (filePath: string): Observable<string> => {
    return Observable.create(
        (observer: Observer<string>): TeardownLogic => {
            const rl = readline.createInterface({
                input: fs.createReadStream(filePath),
                crlfDelay: Infinity,
            });

            rl.on('line', (line: string) => {
                observer.next(line);
            });
            rl.on('close', () => {
                observer.complete();
            });
        },
    );
};

import * as csv from 'csv-parse/lib/sync';

export const readCsvLineObs$ = (filePath: string) => {
    var options = {};
    options['columns'] = false;
    options['skip_empty_lines'] = true;
    const lines$ = readLineObs$(filePath).pipe(
        tap(line => logTrace('readCsvLineObs$/line ->' + line)),
        map((line: any) => csv(line, options)[0]),
        tap(record => logTrace('readCsvLineObs$/record ->' + JSON.stringify(record))),
        share(),
    );
    const columnsObs$ = lines$.pipe(
        take(1),
        tap(record => logTrace('columnsObs$/record ->' + JSON.stringify(record))),
    );
    const data$ = lines$.pipe(tap(record => logTrace('data$/record ->' + JSON.stringify(record))));
    return columnsObs$.pipe(
        concatMap((columns: any) =>
            data$.pipe(
                map(record => _.object(columns, record)),
                tap(record => logTrace('columnsObs$-data$/record ->' + JSON.stringify(record))),
            ),
        ),
    );
};

import { connectObs } from 'observable-mongo';
import { MongoClient, Db } from 'mongodb';

export const getMongoClient = (mongoUri: string, dbname: string, pipeline: OperatorFunction<Db, any>) => {
    let mongoClient: MongoClient;
    return connectObs(mongoUri).pipe(
        tap(client => (mongoClient = client)),
        map(client => client.db(dbname)),
        tap(() => logTrace('getMongoClient -> CONNECTED')),
        pipeline,
        tap(() => logTrace('getMongoClient -> DISCONNECTED')),
        finalize(() => mongoClient.close()),
    );
};

import * as CryptoJS from 'crypto-js';

export const getPasswordHash$ = (password: string) => {
    console.log(password);
    return Observable.create(
        (observer: Observer<string>): TeardownLogic => {
            observer.next(CryptoJS.SHA3(password).toString());
            observer.complete();
        },
    );
};

export const validatePasswordAgainstHash$ = (password: string, passwordHash: string) => {
    console.log(password);
    console.log(passwordHash);
    return Observable.create(
        (observer: Observer<boolean>): TeardownLogic => {
            const isValid = passwordHash == CryptoJS.SHA3(password).toString();
            observer.next(isValid);
            observer.complete();
        },
    );
};

import * as jwt from 'jsonwebtoken';
import { config } from '../api/config';

export const generateJwt$ = (payload, expiresIn = 300) => {
    return Observable.create(
        (observer: Observer<string>): TeardownLogic => {
            jwt.sign(payload, config['jwtSecretKey'], { expiresIn: expiresIn }, function(err, token) {
                if (err) throw err;
                observer.next(token);
                observer.complete();
            });
        },
    );
};

export const verifyJwt$ = (token: string, options?) => {
    return Observable.create(
        (observer: Observer<any>): TeardownLogic => {
            jwt.verify(token, config['jwtSecretKey'], options, function(err, decoded) {
                if (err) throw err;
                observer.next(decoded);
                observer.complete();
            });
        },
    );
};

export const verifyJwt = (token: string) => {
    let jwtToken: any;
    try {
        jwtToken = jwt.verify(token, config.jwtSecretKey);
    } catch (err) {
        if (err) throw err;
    }
    return jwtToken;
};
