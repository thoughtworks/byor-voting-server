import { Observable, Observer, TeardownLogic, EMPTY } from 'rxjs';
import { isEmailValid } from './mail-api.util';
import { Collection } from 'mongodb';
import { findObs } from 'observable-mongo';
import { filter, mergeMap, toArray, catchError } from 'rxjs/operators';
import { Technology } from '../model/technology';
import { Comment } from '../model/comment';

const MAIL_GUN_SEC = {
    api_key: 'the api key', // eslint-disable-line
    domain: 'the domain',
};

MAIL_GUN_SEC.api_key = process.env['MAILGUN_API_KEY']; // eslint-disable-line
MAIL_GUN_SEC.domain = process.env['MAILGUN_DOMAIN'];

function areMailgunParamsComplete() {
    return MAIL_GUN_SEC.api_key && MAIL_GUN_SEC.domain;
}

var mailgun;
if (areMailgunParamsComplete()) {
    mailgun = require('mailgun-js')({ apiKey: MAIL_GUN_SEC.api_key, domain: MAIL_GUN_SEC.domain });
}

const fromMail = 'byor@byor.com';

export function sendMail(from: string, to: string, subject: string, text: string) {
    if (!MAIL_GUN_SEC.api_key || !MAIL_GUN_SEC.domain) {
        console.error(
            'try to send mail with MAILGUN client without having specified MAILGUN_API_KEY and MAILGUN_DOMAIN as environment variables',
        );
        return EMPTY;
    }
    if (!isEmailValid(to)) {
        console.warn(`The to email ${to} is not a valid email`);
        return EMPTY;
    }

    const data = {
        from,
        to,
        subject,
        text,
    };

    return new Observable(
        (observer: Observer<any>): TeardownLogic => {
            mailgun.messages().send(data, (error, body) => {
                if (error) {
                    observer.error({ error, data });
                    return;
                }
                observer.next(body);
                observer.complete();
            });
        },
    );
}

export function sendMailForComment(usersColl: Collection, tech: Technology, comment: Comment, user: string) {
    const subject = `Comment saved for ${tech.name}`;
    const text = `${comment.author} has saved a comment for ${tech.name}. "comment.text"`;
    return sendMailToUsers1(usersColl, subject, text, user);
}

export function sendMailForRecommendation(usersColl: Collection, tech: Technology, user: string) {
    const subject = `Recommendation saved for ${tech.name}`;
    const text = `${tech.recommendation.author} has saved a recommendation for ${
        tech.name
    }. "tech.recommendation.text"`;
    return sendMailToUsers1(usersColl, subject, text, user);
}

function sendMailToUsers1(usersColl: Collection, subject: string, text: string, user: string) {
    console.log('sendMailToUsers');
    return findObs(usersColl).pipe(
        filter(_user => user !== _user.user),
        filter(_user => isEmailValid(_user.user)),
        mergeMap(_user =>
            sendMail(fromMail, _user.user, subject, text).pipe(
                catchError(err => {
                    console.log(
                        `error in sending mail to ${JSON.stringify(_user, null, 2)} - error ${JSON.stringify(
                            err,
                            null,
                            2,
                        )}`,
                    );
                    return EMPTY;
                }),
            ),
        ),
        toArray(),
    );
}
