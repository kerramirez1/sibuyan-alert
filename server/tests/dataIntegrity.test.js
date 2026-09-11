import { describe, expect, test } from 'vitest';
import {
    RESPONDER_UNIT_TYPES,
    ACCEPTED_UNIT_TYPE_VALUES,
    isSupportedResponderUnitType,
    normalizeUnitType,
} from '../config/responderUnits.js';
import { getRespondingAgencies } from '../utils/reportAgencies.js';
import {
    toOptionalCount,
    toSerializableCount,
} from '../utils/casualtyCounts.js';
import { toPublicReport } from '../utils/publicReport.js';
import { toOperationalReportSummary } from '../utils/operationalReport.js';

const { default: Report } = await import('../models/Report.js');
const { default: User } = await import('../models/User.js');

describe('responder unit types — single source of truth', () => {
    test('the canonical list covers every type the modal offers', () => {
        // BARANGAY and MEDICAL are offered by the client; RESCUE is accepted by
        // the API. All three previously failed the legacy responderAgency enum.
        for (const type of ['MDRRMO', 'PNP', 'BFP', 'Medical Team', 'RESCUE', 'MEDICAL', 'BARANGAY']) {
            expect(RESPONDER_UNIT_TYPES).toContain(type);
            expect(isSupportedResponderUnitType(type)).toBe(true);
        }
    });

    test('Report.responderAgency accepts every canonical unit type', () => {
        // Regression: a BARANGAY/MEDICAL/RESCUE first responder threw a
        // ValidationError here and the whole response was rejected with a 500.
        const enumValues = Report.schema.path('responderAgency').options.enum;
        for (const type of RESPONDER_UNIT_TYPES) {
            expect(enumValues).toContain(type);
        }
        expect(enumValues).toContain(null);
    });

    test('Report.responders.unitType and responderAgency use the same list', () => {
        const unitTypeEnum = Report.schema.path('responders.unitType').options.enum;
        const agencyEnum = Report.schema.path('responderAgency').options.enum;
        for (const type of RESPONDER_UNIT_TYPES) {
            expect(unitTypeEnum).toContain(type);
            expect(agencyEnum).toContain(type);
        }
    });

    test('User.agency accepts the canonical set plus the legacy LGU alias', () => {
        const enumValues = User.schema.path('agency').options.enum;
        for (const value of ACCEPTED_UNIT_TYPE_VALUES) {
            expect(enumValues).toContain(value);
        }
    });

    test('normalizes the legacy LGU alias to MDRRMO', () => {
        expect(normalizeUnitType('LGU')).toBe('MDRRMO');
        expect(normalizeUnitType('PNP')).toBe('PNP');
        expect(normalizeUnitType(undefined)).toBeUndefined();
    });
});

describe('responding agencies — shared derivation', () => {
    test('collects the full multi-unit set from responders[]', () => {
        const agencies = getRespondingAgencies({
            responders: [{ unitType: 'MDRRMO' }, { unitType: 'BFP' }, { unitType: 'MDRRMO' }],
        });
        expect(agencies).toEqual(['MDRRMO', 'BFP']);
    });

    test('falls back to the legacy responderAgency mirror', () => {
        expect(getRespondingAgencies({ responderAgency: 'PNP' })).toEqual(['PNP']);
    });

    test('merges legacy mirror and array without duplicating', () => {
        const agencies = getRespondingAgencies({
            responderAgency: 'MDRRMO',
            responders: [{ unitType: 'MDRRMO' }, { unitType: 'MEDICAL' }],
        });
        expect(agencies).toEqual(['MDRRMO', 'MEDICAL']);
    });

    test('returns an empty list for a report with no response', () => {
        expect(getRespondingAgencies({})).toEqual([]);
    });
});

describe('casualty counts — "not recorded" is distinct from zero', () => {
    test('toOptionalCount preserves absence and validates presence', () => {
        expect(toOptionalCount(undefined)).toBeNull();
        expect(toOptionalCount(null)).toBeNull();
        expect(toOptionalCount('')).toBeNull();
        expect(toOptionalCount(0)).toBe(0);
        expect(toOptionalCount('2')).toBe(2);
        expect(toOptionalCount(3.9)).toBe(3);
    });

    test('toSerializableCount keeps null and fails closed for garbage', () => {
        expect(toSerializableCount(null)).toBeNull();
        expect(toSerializableCount(0)).toBe(0);
        expect(toSerializableCount(-3)).toBe(0);
        expect(toSerializableCount('not-a-number')).toBe(0);
        expect(toSerializableCount(4)).toBe(4);
    });

    test('the Report schema defaults casualties to null, not 0', () => {
        expect(Report.schema.path('casualties.injured').options.default).toBeNull();
        expect(Report.schema.path('casualties.fatalities').options.default).toBeNull();
        expect(Report.schema.path('casualties.missing').options.default).toBeNull();
    });
});

describe('serializers — what the UI actually receives', () => {
    const source = {
        _id: '64b100000000000000000001',
        incidentCategory: 'accident',
        incidentType: 'vehicular',
        title: 'Collision',
        description: '',
        address: 'Circumferential Road',
        barangay: 'Poblacion',
        municipalityName: 'Cajidiocan',
        originalMunicipalityName: 'San Fernando',
        coordinates: { lat: 12.4, lng: 122.6 },
        incidentTime: new Date('2026-09-11T00:00:00Z'),
        status: 'verified',
        severity: 'moderate',
        casualties: { injured: null, fatalities: 2, missing: null },
        responders: [{ unitType: 'BFP' }],
        responderAgency: 'MDRRMO',
        images: [],
        evidenceMetadata: [],
    };

    test('public feed keeps null casualties and publishes the origin municipality', () => {
        const out = toPublicReport(source, {});

        expect(out.casualties.injured).toBeNull();
        expect(out.casualties.fatalities).toBe(2);
        expect(out.casualties.missing).toBeNull();
        expect(out.originalMunicipalityName).toBe('San Fernando');
    });

    test('public and operational feeds agree on the responding agencies', () => {
        const publicOut = toPublicReport(source, {});
        const operationalOut = toOperationalReportSummary(source);

        expect(publicOut.respondingAgencies).toEqual(['MDRRMO', 'BFP']);
        expect(operationalOut.respondingAgencies).toEqual(['MDRRMO', 'BFP']);
    });

    test('operational feed keeps null casualties too', () => {
        const out = toOperationalReportSummary(source);
        expect(out.casualties.injured).toBeNull();
        expect(out.casualties.fatalities).toBe(2);
    });
});
