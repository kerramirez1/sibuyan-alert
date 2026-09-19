import { describe, expect, test } from 'vitest';
import {
    ACTIVE_INCIDENT_STATUS_KEY,
    getMapFilterStatusDot,
    getMapLegendStatusKeys,
    MAP_ACTIVE_INCIDENT_CONFIG,
    MAP_RESPONDING_INCIDENT_CONFIG,
    MAP_RISK_ZONE_CONFIG,
    MAP_STATUS_CONFIG,
    RESPONDING_INCIDENT_STATUS_KEY,
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

    test('explains the responding dot on every legend that can show one', () => {
        // One rail for every role (see mapExperience) means one answer: whichever
        // tab is open, a legend that can show the responding marker names the dot
        // that is actually drawn. An animation with no legend entry is
        // decoration.
        for (const filterStatus of [null, 'all', 'active', 'incidents', 'responding']) {
            expect(getMapLegendStatusKeys({ filterStatus, showPending: true }))
                .toContain(RESPONDING_INCIDENT_STATUS_KEY);
        }
        expect(getMapLegendStatusKeys({ filterStatus: 'responding' }))
            .toEqual([RESPONDING_INCIDENT_STATUS_KEY]);

        // 'All open' includes pending whenever the viewer is sent those rows, so
        // its legend names the amber pin instead of leaving the one marker the
        // tab draws unexplained.
        expect(getMapLegendStatusKeys({ showPending: true }))
            .toEqual(['pending', ACTIVE_INCIDENT_STATUS_KEY, RESPONDING_INCIDENT_STATUS_KEY]);
        expect(getMapLegendStatusKeys({})).toEqual([
            ACTIVE_INCIDENT_STATUS_KEY,
            RESPONDING_INCIDENT_STATUS_KEY,
        ]);

        // The pending tab is the permission boundary: a viewer who is never sent
        // pending rows gets an empty legend rather than an entry it cannot
        // explain.
        expect(getMapLegendStatusKeys({ filterStatus: 'pending', showPending: false })).toEqual([]);
        expect(getMapLegendStatusKeys({ filterStatus: 'pending', showPending: true })).toEqual(['pending']);
    });

    test('presents the responding dot in the one blue every handled state uses', () => {
        // Same colour, different shape: the responding marker is a dot inside a
        // travelling ring, while verified and transferred stay teardrop pins. The
        // second hue that used to live here would have had to be explained and
        // would have competed with the hazard red that owns the map's alerts.
        expect(MAP_RESPONDING_INCIDENT_CONFIG.markerColor).toBe(MAP_STATUS_CONFIG.verified.markerColor);
        expect(MAP_RESPONDING_INCIDENT_CONFIG.markerColor).toBe(MAP_STATUS_CONFIG.responding.markerColor);
        expect(MAP_RESPONDING_INCIDENT_CONFIG.markerColor).toBe(MAP_STATUS_CONFIG.transferred.markerColor);
        expect(MAP_RESPONDING_INCIDENT_CONFIG.markerColor).not.toBe(MAP_RISK_ZONE_CONFIG.markerColor);
        expect(MAP_RESPONDING_INCIDENT_CONFIG.label).toBe('Being responded to');
    });

    test('keeps verified, transferred and responding on the one active blue', () => {
        // One operational condition, one colour: the chrome reads the same blue
        // the canvas draws, so a status can no longer be blue on the map and
        // violet or cyan in the legend, the badges or the notifications. Labels
        // (and the responding dot's shape) are what separate the three now.
        for (const status of ['verified', 'transferred', 'responding']) {
            expect(MAP_STATUS_CONFIG[status].markerColor).toBe(MAP_ACTIVE_INCIDENT_CONFIG.markerColor);
            expect(MAP_STATUS_CONFIG[status].dot).toBe(MAP_ACTIVE_INCIDENT_CONFIG.dot);
            expect(MAP_STATUS_CONFIG[status].badge).toBe(MAP_STATUS_CONFIG.verified.badge);
        }
        // Colour no longer separates them, so the labels must: three states,
        // three names, never two spellings of one.
        const handledLabels = ['verified', 'transferred', 'responding']
            .map((status) => MAP_STATUS_CONFIG[status].label);
        expect(new Set(handledLabels).size).toBe(3);
    });

    test('keeps one owner for the responding lifecycle value', () => {
        // The dot entry is a presentation, not a second status: the state's name,
        // colour and badge still come from MAP_STATUS_CONFIG.responding.
        expect(MAP_STATUS_CONFIG.responding.label).toBe('Active response');
        expect(MAP_STATUS_CONFIG.responding.dot).toBe(MAP_STATUS_CONFIG.verified.dot);
    });

    test('names both members of the readiness filter in the legend', () => {
        expect(getMapLegendStatusKeys({ filterStatus: 'dispatch' }))
            .toEqual(['verified', 'transferred']);
    });

    test('keeps the default legend scoped to the open set', () => {
        // The archive tab carries the resolved pin, and rejected reports are not
        // drawn at all, so neither belongs in the legend for the open set.
        const legend = getMapLegendStatusKeys({ showPending: true });

        expect(legend).toContain(ACTIVE_INCIDENT_STATUS_KEY);
        expect(legend).not.toContain('resolved');
        expect(legend).not.toContain('rejected');
    });
});
