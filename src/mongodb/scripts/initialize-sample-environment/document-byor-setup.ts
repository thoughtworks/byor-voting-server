import { tap, concatMap, finalize } from 'rxjs/operators';
import { connectObs } from 'observable-mongo';
import { config } from '../../../api/config';

import { addBYORAdmin, authenticate, cancelInitiative, ExecutionContext } from './document-byor-setup.utils';

//*******************************  START OF THE DOCUMENTATION   **************************************************** */

// One evenening, the CIO and the CTO of the SmartCompany attended at a presentation of the BYOR application and decided to try
// it at their Company, i.e. the SmartCompany.

// The morning after the CIO called the Rebecca, the chief architect, told her about the BYOR and got her excited.
// Rebecca, when back at her room, downloaded immediately the code and installed on a newly created simple environment,
// just a couple of servers.

// She then set herself as administrator of the application
const __adminId = 'rebecca@smartco.com';
const __adminPwd = 'rebecca';
const addAdmin = addBYORAdmin(__adminId, __adminPwd);

// and then adds James and Martina as additional administrators
const __secondAdminId = 'james@smartco.com';
const __secondPwd = 'james';
const addSecondAdmin = addBYORAdmin(__secondAdminId, __secondPwd);
const __thirdAdminId = 'martina@smartco.com';
const __thirdPwd = 'martina';
const addThirdAdmin = addBYORAdmin(__thirdAdminId, __thirdPwd);

// In the afternoon Rebecca calls James and Martina for a meeting to present them the BYOR app and discuss
// of possible ways to leverage this new tool.
// When they meet, that afternoon, the three quickly come to the agreement of creating an Initiative in BYOR
// under which they will group all VotingEvents the SmartCompany will run. Consider that the SmartCompany belongs
// to a Group and has other syster Companies. If one sister Company decides in future to use the the BYOR app,
// they will be able to create new Initiatives for them using the same setup created by Rebecca.
// So James logs in with his userid
const jamesAuthenticate = authenticate(__secondAdminId, __secondPwd);

// Then, being him an Admin of BYOR, he creates the fist initiative.
// Well, actually to be sure that nobody did it before him, he starts cancelling the initiative just in case and then creates it
const __initiativeName = 'The SmartCompany Initiative';
const jamesCancelTheInitiativeBeforeAddingItAgain = cancelInitiative(__initiativeName);
// and now he creates the initiative
// const jamesCreateTheInitiative = createInitiative(__initiativeName);

//*******************************  END OF THE DOCUMENTATION   **************************************************** */

//**************************************************************************************************************** */
//**************************************************************************************************************** */
//*******************************  EXECUTION OF THE DOCUMENTATION   ********************************************** */
//**************************************************************************************************************** */
//**************************************************************************************************************** */
export function executeDocumentBYORSetup() {
    let context: ExecutionContext = { cachedDb: null, authorizationHeaders: null };
    return connectObs(config.mongoUri).pipe(
        tap(client => {
            context.cachedDb = { dbName: config.dbname, client, db: client.db(config.dbname) };
        }),
        concatMap(() => addAdmin(context)),
        concatMap(() => addSecondAdmin(context)),
        concatMap(() => addThirdAdmin(context)),
        concatMap(() => jamesAuthenticate(context)),
        concatMap(() => jamesCancelTheInitiativeBeforeAddingItAgain(context)),
        finalize(() => context.cachedDb.client.close()),
    );
}
