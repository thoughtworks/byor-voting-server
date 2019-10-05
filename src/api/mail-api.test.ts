// to test sendMail it is required to have an API_KEY and a DOMAIN from Mailgun (https://www.mailgun.com/)
// if this data is available sendMail can be tested with the following command
// MAILGUN_API_KEY=mailgun-api-key MAILGUN_DOMAIN=mailgun-registered-domain npx ts-node-dev --transpileOnly src/api/mail-api.test.ts abc@123.com enrico.piccinin@gmail.com subject-test the-text

import { sendMail } from './mail-api';

const from = process.argv[2] || 'byor@byor.com';
const to = process.argv[3] || 'enrico.piccinin@gmail.com';
const subject = process.argv[4] || 'byor test';
const text = process.argv[5] || 'This is a mail from byor';

sendMail(from, to, subject, text).subscribe(console.log, console.error, () => console.log('DONE'));
