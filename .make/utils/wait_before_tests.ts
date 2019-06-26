import { sleep } from "./sleep";

describe('Fixed wait for debugger', async () => {
    it('waits for 5 seconds', async () => {
        await sleep(5000);
    }).timeout(10000);
});
