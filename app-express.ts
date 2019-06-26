import * as express from 'express';
import * as logger from 'morgan';
import * as bodyParser from 'body-parser';
import { router } from './routes-express/index';
import * as cors from 'cors';

export const app = express();

app.use(logger('dev'));
app.use(cors());

// https://stackoverflow.com/questions/19917401/error-request-entity-too-large
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));

// app.use(express.json());

app.use('/', router);
