import { describe, expect, test } from 'vitest';
import { DASHBOARD_FOCUS_PARAMS, withoutFocusedEntity } from '../utils/dashboardFocus';

describe('withoutFocusedEntity', () => {
    test('drops the focused record and keeps everything else', () => {
        const next = withoutFocusedEntity(new URLSearchParams(
            'view=map&riskZone=zone%2Fone&panel=zones&lat=12.4&lng=122.6&zoom=14',
        ));

        // The zone the viewer was sent to is gone...
        expect(next.has('riskZone')).toBe(false);
        expect(DASHBOARD_FOCUS_PARAMS.every((key) => !next.has(key))).toBe(true);
        // ...while the request for the map view, the arrival's panel, and the
        // camera a link asked for all survive: where the viewer is has not
        // changed, only which record the URL was pointing at.
        expect(next.get('view')).toBe('map');
        expect(next.get('panel')).toBe('zones');
        expect(next.get('lat')).toBe('12.4');
        expect(next.get('lng')).toBe('122.6');
        expect(next.get('zoom')).toBe('14');
        // An encoded id does not come back mangled.
        expect(new URLSearchParams('riskZone=zone%2Fone').get('riskZone')).toBe('zone/one');
    });

    test('drops a focused incident the same way', () => {
        const next = withoutFocusedEntity(new URLSearchParams('view=map&report=report-1'));

        expect(next.has('report')).toBe(false);
        expect(next.get('view')).toBe('map');
    });

    test('returns null when there is nothing to clear', () => {
        // `null` is what stops the caller from navigating: `setSearchParams`
        // pushes a history entry per call, and a click that changes nothing must
        // not leave a second copy of the same URL in the back stack.
        expect(withoutFocusedEntity(new URLSearchParams('view=map'))).toBeNull();
        expect(withoutFocusedEntity(new URLSearchParams(''))).toBeNull();
        expect(withoutFocusedEntity(undefined)).toBeNull();
    });

    test('accepts a query string or a plain object as well as URLSearchParams', () => {
        // The page hands it the router's own URLSearchParams; the other two
        // shapes are there so a caller with a raw query (a test, a link builder)
        // gets the same answer without a wrapper of its own.
        const fromString = withoutFocusedEntity('view=map&riskZone=zone-1');
        const fromObject = withoutFocusedEntity({ view: 'map', report: 'report-1' });

        expect(fromString.get('view')).toBe('map');
        expect(fromString.has('riskZone')).toBe(false);
        expect(fromObject.get('view')).toBe('map');
        expect(fromObject.has('report')).toBe(false);
    });

    test('leaves the caller\'s params untouched', () => {
        const original = new URLSearchParams('view=map&riskZone=zone-1');
        withoutFocusedEntity(original);

        // The page's own params object is read on every render; clearing the
        // focus must be a new value rather than an edit under the router.
        expect(original.get('riskZone')).toBe('zone-1');
    });
});
