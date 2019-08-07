import { executeDocumentBYORSetup } from './document-byor-setup';

executeDocumentBYORSetup().subscribe(
    null,
    err => {
        console.error(err);
    },
    () => console.log('DONE'),
);
