import { describe, expect, test } from 'vitest';
import {
    distanceMeters,
    findDuplicateCandidates,
    MAX_DUPLICATE_CANDIDATES,
} from '../utils/duplicateDetection.js';

const ORIGIN = { lat: 12.4, lng: 122.6 };
const INCIDENT_TIME = '2026-08-11T04:00:00.000Z';

const candidate = (overrides = {}) => ({
    _id: 'report-existing',
    status: 'verified',
    incidentType: 'vehicular',
    address: 'Poblacion coastal road',
    barangay: 'Poblacion',
    coordinates: { lat: 12.4005, lng: 122.6005 },
    incidentTime: '2026-08-11T03:50:00.000Z',
    createdAt: '2026-08-11T03:51:00.000Z',
    ...overrides,
});

const find = (candidates, overrides = {}) => findDuplicateCandidates({
    candidates,
    coordinates: ORIGIN,
    incidentTime: INCIDENT_TIME,
    incidentType: 'vehicular',
    ...overrides,
});

describe('distanceMeters', () => {
    test('returns zero for identical points', () => {
        expect(distanceMeters(12.4, 122.6, 12.4, 122.6)).toBe(0);
    });

    test('measures a short offset in the expected range', () => {
        const metres = distanceMeters(12.4, 122.6, 12.4005, 122.6005);
        expect(metres).toBeGreaterThan(50);
        expect(metres).toBeLessThan(110);
    });
});

describe('findDuplicateCandidates', () => {
    test('flags a nearby report filed around the same time', () => {
        const [match] = find([candidate()]);

        expect(match).toMatchObject({
            reportId: 'report-existing',
            status: 'verified',
            typeMatch: true,
        });
        expect(match.distanceMeters).toBeLessThan(250);
        expect(match.minutesAgo).toBe(10);
    });

    test('ignores reports beyond the radius', () => {
        const far = candidate({ coordinates: { lat: 12.45, lng: 122.65 } });
        expect(find([far])).toEqual([]);
    });

    test('ignores reports outside the time window', () => {
        const stale = candidate({ incidentTime: '2026-08-11T02:00:00.000Z' });
        expect(find([stale])).toEqual([]);
    });

    test('ignores rejected reports because they are not live dispatches', () => {
        expect(find([candidate({ status: 'rejected' })])).toEqual([]);
    });

    test('ignores candidates without usable coordinates', () => {
        expect(find([candidate({ coordinates: null })])).toEqual([]);
        expect(find([candidate({ coordinates: { lat: 'north', lng: 122.6 } })])).toEqual([]);
    });

    test('falls back to createdAt when a candidate has no incident time', () => {
        const [match] = find([candidate({ incidentTime: undefined })]);
        expect(match.reportId).toBe('report-existing');
    });

    test('reports a type mismatch without excluding the candidate', () => {
        const [match] = find([candidate({ incidentType: 'motorcycle' })]);
        expect(match.typeMatch).toBe(false);
    });

    test('returns candidates nearest first', () => {
        const near = candidate({ _id: 'near', coordinates: { lat: 12.4002, lng: 122.6002 } });
        const far = candidate({ _id: 'far', coordinates: { lat: 12.4015, lng: 122.6015 } });

        expect(find([far, near]).map((match) => match.reportId)).toEqual(['near', 'far']);
    });

    test('caps the number of candidates returned', () => {
        const many = Array.from({ length: 12 }, (_, index) => candidate({ _id: `report-${index}` }));
        expect(find(many)).toHaveLength(MAX_DUPLICATE_CANDIDATES);
    });

    test('returns nothing when the submission has no usable location or time', () => {
        expect(find([candidate()], { coordinates: null })).toEqual([]);
        expect(find([candidate()], { coordinates: { lat: NaN, lng: 122.6 } })).toEqual([]);
        expect(find([candidate()], { incidentTime: 'not-a-date' })).toEqual([]);
        expect(find([candidate()], { incidentTime: undefined })).toEqual([]);
    });

    test('tolerates a missing candidate list', () => {
        expect(findDuplicateCandidates({ coordinates: ORIGIN, incidentTime: INCIDENT_TIME })).toEqual([]);
    });
});
