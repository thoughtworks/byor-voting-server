import { Subject } from 'rxjs';

export class RefreshTrigger {
    private static refresh$ = new Subject<any>();

    public static refresh() {
        this.refresh$.next(null);
    }

    public static getRefreshTrigger() {
        return this.refresh$;
    }
}
