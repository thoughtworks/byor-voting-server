import { Technology } from './technology';
import { TWBlip } from './tw-blips';
import * as fs from 'fs';
import * as parse from 'csv-parse/lib/sync';
import * as _ from 'lodash';

export const TEST_TECHNOLOGIES = [
    {
        id: '0001',
        name: 'Babel',
        quadrant: 'tools',
        isNew: false,
        description: 'Description of <strong>Babel</strong>',
    },
    {
        id: '0002',
        name: 'Ember.js',
        quadrant: 'languages & frameworks',
        isNew: true,
        description: 'Description of <strong>Ember.js</strong>',
    },
    {
        id: '0003',
        name: 'Docker',
        quadrant: 'platforms',
        isNew: false,
        description: `We remain excited about <a href="https://www.docker.com/"><strong>Docker</strong></a> as it evolves from a tool 
    to a complex platform of technologies. Development teams love Docker, as the Docker image format makes it easier to achieve parity between development and production, making for reliable deployments. It is a natural fit in a microservices-style application as a packaging mechanism for self-contained services. On the operational front, Docker support in monitoring tools (<a href="/radar/tools/sensu">Sensu</a>, <a href="/radar/tools/prometheus">Prometheus</a>, <a href="https://github.com/google/cadvisor">cAdvisor</a>, etc.), orchestration tools (<a href="/radar/platforms/kubernetes">Kubernetes</a>, <a href="https://mesosphere.github.io/marathon/">Marathon</a>, etc.) and deployment-automation tools reflect the growing maturity of the platform and its readiness for production use. A word of caution, though: There is a prevalent view of Docker and Linux containers in general as being "lightweight virtualization," but we would not recommend using Docker as a secure process-isolation mechanism, though we are paying attention to the 
    introduction of user namespaces and seccomp profiles in version 1.10 in this regard.`,
        imageFile: 'docker.png',
    },
    {
        id: '0004',
        name: 'Consumer-driven contract testing',
        quadrant: 'techniques',
        isNew: true,
        description: 'Description of <strong>Consumer-driven contract testin</strong>',
    },
    {
        id: '0005',
        name: 'LambdaCD',
        quadrant: 'tools',
        isNew: true,
        description: 'Description of <strong>LambdaCD</strong>',
    },
];

export function defaultTWTechnologies(): Technology[] {
    var lines = fs.readFileSync(`${__dirname}/../../data/TW_blips.csv`, 'utf8');
    var options = {};
    options['columns'] = true;
    options['skip_empty_lines'] = true;
    const records = _.chain(parse(lines, options))
        .map((record, index) => {
            return {
                id: index.toString(),
                name: record['name'],
                quadrant: record['quadrant'],
                isNew: record['is_new'].toLowerCase() == 'true' ? true : false,
                description: '',
            };
        })
        .value();
    return records;
}

export function TWBlips(): TWBlip[] {
    var lines = fs.readFileSync(`${__dirname}/../../data/TW_blips_history.csv`, 'utf8');
    var options = {};
    options['columns'] = true;
    options['skip_empty_lines'] = true;
    const records = _.chain(parse(lines, options))
        .map((record, index) => {
            return {
                id: index.toString(),
                edition: record['edition'],
                name: record['name'],
                quadrant: record['quadrant'],
                ring: record['ring'],
                description: record['description'],
            };
        })
        .value();
    return records;
}
