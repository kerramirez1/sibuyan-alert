import { describe, expect, test } from 'vitest';
import {
    ACTIVE_MAP_STATUS_KEYS,
    getMapFilterStatusDot,
    getMapLegendStatusKeys,
    MAP_ACTIVE_INCIDENT_CONFIG,
    MAP_STATUS_CONFIG,
} from '../config/mapVisuals';

describe('map status visuals', () => {
    test('gives every status filter its own status color', () => {
        for (const status of Object.keys(MAP_STATUS_CONFIG)) {
            expect(getMapFilterStatusDot(status)).toBe(MAP_STATUS_CONFIG[status].dot);
        }
    });

    test('draws the folded public tabs with the unified active-incident color', () => {
        // Reporters and guests see one "Active incident" pin for verified,
        // transferred, and responding, so their tab must use that pin's color
        // rather than picking one member of the set at random.
        expect(getMapFilterStatusDot('active')).toBe(MAP_ACTIVE_INCIDENT_CONFIG.dot);
        expect(getMapFilterStatusDot('incidents')).toBe(MAP_ACTIVE_INCIDENT_CONFIG.dot);
    });

    test('draws the dispatch pair with a real status color, not the unknown-state gray', () => {
        // 'dispatch' is not a lifecycle value, so a lookup straight into
        // MAP_STATUS_CONFIG would miss and the mobile filter pill would fall
        // back to gray — the color that means "unrecognized state".
        expect(getMapFilterStatusDot('dispatch')).toBe(MAP_STATUS_CONFIG.verified.dot);
        expect(getMapFilterStatusDot('dispatch')).not.toBe('bg-gray-400');
    });

    test('leaves the two non-status filters to the caller', () => {
        // `all` is every active incident and `risk-zones` is a hazard area, so
        // neither has one honest status color.
        expect(getMapFilterStatusDot('all')).toBeNull();
        expect(getMapFilterStatusDot('risk-zones')).toBeNull();
        expect(getMapFilterStatusDot(null)).toBeNull();
        expect(getMapFilterStatusDot(undefined)).toBeNull();
    });

    test('names both members of the readiness filter in the legend', () => {
        expect(getMapLegendStatusKeys({ filterStatus: 'dispatch' }))
            .toEqual(['verified', 'transferred']);
    });

    test('keeps the operational legend scoped to active, non-resolved statuses', () => {
        const operational = getMapLegendStatusKeys({ filterMode: 'response', showPending: true });

        expect(operational).toEqual(ACTIVE_MAP_STATUS_KEYS.filter((status) => status !== 'resolved'));
        expect(operational).not.toContain('resolved');
    });
});
