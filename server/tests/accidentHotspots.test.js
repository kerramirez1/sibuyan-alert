import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi as jest } from 'vitest';
import {
    ACCIDENT_HOTSPOT_BOUNDS,
    ACCIDENT_HOTSPOT_CLASSES,
    ACCIDENT_HOTSPOT_RULE_DEFAULTS,
    ACCIDENT_HOTSPOT_STATUSES,
    accidentHotspotValidator,
    buildAccidentHotspotLayer,
    buildAccidentHotspotMatch,
    buildHotspotFeatureCollection,
    classifyHotspotClusters,
    clusterAccidentReports,
    haversineMeters,
    isValidHotspotCoordinate,
    resolveAccidentHotspotRule,
} from '../utils/accidentHotspots.js';

/** The one report this system actually holds: Cambijang, Magdiwang. */
const REAL_REPORT = { lat: 12.345053009068735, lng: 122.67621853831145 };

/**
 * Fixture geometry, in real metres.
 *
 * The distance rule is the whole feature, so the fixtures cannot be "close
 * enough" — they are placed by the same spherical maths the rule uses (Earth
 * radius 6 371 008.8 m gives 111 195 m per degree of latitude), and one test
 * asserts that a 100 m offset really measures 100 m.
 */
const METERS_PER_DEGREE = 111_195;

const north = (point, meters) => ({
    lat: point.lat + (meters / METERS_PER_DEGREE),
    lng: point.lng,
});

const east = (point, meters) => ({
    lat: point.lat,
    lng: point.lng + (meters / (METERS_PER_DEGREE * Math.cos((point.lat * Math.PI) / 180))),
});

/** A hotspot's worth of reports around one anchor, all within 70 m of it. */
const reportsAround = (anchor, distances) => distances.map((distance) => (
    distance % 2 === 0 ? east(anchor, distance) : north(anchor, distance)
));

// --- Route harness -------------------------------------------------------
// Hoisted mocks plus a module-scope import, because the route is imported once
// per file while the mocked user changes per test.

const getAccidentHotspotsMock = jest.fn();

let mockUser = {
    _id: '507f1f77bcf86cd799439011',
    role: 'municipal_admin',
    assignedMunicipality: 'Cajidiocan',
};

jest.mock('../models/HighRiskZone.js', () => ({
    default: {
        create: jest.fn(),
        findById: jest.fn(),
        find: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([]) }),
        }),
    },
}));

jest.mock('../models/Report.js', () => ({
    default: { getAccidentHotspots: getAccidentHotspotsMock },
}));

jest.mock('../services/gridFsService.js', () => ({
    uploadFilesToGridFS: jest.fn(),
    deleteGridFsFilesByUrls: jest.fn().mockResolvedValue([]),
}));

jest.mock('../services/riskZoneJurisdictionService.js', () => ({
    resolveRiskZoneJurisdiction: jest.fn(),
}));

jest.mock('../middleware/auth.js', () => ({
    protect: (req, res, next) => {
        req.user = mockUser;
        next();
    },
}));

const { default: highRiskZoneRoutes } = await import('../routes/highRiskZones.js');

const createApp = () => {
    const app = express();
    app.use('/high-risk-zones', highRiskZoneRoutes);
    return app;
};

describe('accident hotspot rule', () => {
    test('the built-in rule is the documented one', () => {
        expect(ACCIDENT_HOTSPOT_RULE_DEFAULTS).toEqual({
            radiusMeters: 100,
            windowDays: 30,
            mediumMinReports: 3,
            highMinReports: 6,
        });
        expect(resolveAccidentHotspotRule({})).toEqual(ACCIDENT_HOTSPOT_RULE_DEFAULTS);
    });

    test('the thresholds are configuration, and survive a bad configuration', () => {
        // Adjustable without touching the analysis or the map.
        expect(resolveAccidentHotspotRule({
            ACCIDENT_HOTSPOT_RADIUS_METERS: '250',
            ACCIDENT_HOTSPOT_WINDOW_DAYS: '7',
            ACCIDENT_HOTSPOT_MEDIUM_MIN_REPORTS: '2',
            ACCIDENT_HOTSPOT_HIGH_MIN_REPORTS: '4',
        })).toEqual({
            radiusMeters: 250,
            windowDays: 7,
            mediumMinReports: 2,
            highMinReports: 4,
        });

        // Malformed values fall back rather than taking the layer down.
        expect(resolveAccidentHotspotRule({
            ACCIDENT_HOTSPOT_RADIUS_METERS: 'nonsense',
            ACCIDENT_HOTSPOT_MEDIUM_MIN_REPORTS: '-4',
        })).toMatchObject({
            radiusMeters: 100,
            mediumMinReports: 3,
        });

        // Two invariants the classes depend on, enforced rather than trusted.
        // A single accident can never be made a hotspot by configuration…
        expect(resolveAccidentHotspotRule({ ACCIDENT_HOTSPOT_MEDIUM_MIN_REPORTS: '1' }).mediumMinReports).toBe(2);
        // …and High can never collapse onto Medium, or both switches would claim
        // the same points.
        const inverted = resolveAccidentHotspotRule({
            ACCIDENT_HOTSPOT_MEDIUM_MIN_REPORTS: '8',
            ACCIDENT_HOTSPOT_HIGH_MIN_REPORTS: '2',
        });
        expect(inverted.highMinReports).toBeGreaterThan(inverted.mediumMinReports);
    });

    test('counts only validated lifecycle states', () => {
        expect([...ACCIDENT_HOTSPOT_STATUSES]).toEqual([
            'verified',
            'transferred',
            'responding',
            'resolved',
        ]);
        // Unverified and dismissed records must never pull a hotspot onto the
        // map, so they are absent from the set rather than filtered later.
        expect(ACCIDENT_HOTSPOT_STATUSES).not.toContain('pending');
        expect(ACCIDENT_HOTSPOT_STATUSES).not.toContain('rejected');
        // `transferred` means verified-and-reassigned, so it counts. Leaving it
        // out is why the older aggregation renders nothing on this island.
        expect(ACCIDENT_HOTSPOT_STATUSES).toContain('transferred');
    });

    test('the query filter is a rolling window of the configured length', () => {
        const match = buildAccidentHotspotMatch(new Date('2026-09-21T10:00:00.000Z'));

        expect(match.status).toEqual({ $in: [...ACCIDENT_HOTSPOT_STATUSES] });
        expect(match.incidentTime.$gte.toISOString()).toBe('2026-08-22T10:00:00.000Z');

        const weekly = buildAccidentHotspotMatch(
            new Date('2026-09-21T10:00:00.000Z'),
            { windowDays: 7 }
        );
        expect(weekly.incidentTime.$gte.toISOString()).toBe('2026-09-14T10:00:00.000Z');

        // Coordinates must be numbers inside the island envelope, enforced in the
        // database so a rejected report is never transferred to the server.
        expect(match['coordinates.lat']).toMatchObject({
            $type: 'number',
            $gte: ACCIDENT_HOTSPOT_BOUNDS.minLat,
            $lte: ACCIDENT_HOTSPOT_BOUNDS.maxLat,
        });
        expect(match['coordinates.lng']).toMatchObject({
            $type: 'number',
            $gte: ACCIDENT_HOTSPOT_BOUNDS.minLng,
            $lte: ACCIDENT_HOTSPOT_BOUNDS.maxLng,
        });
    });

    test('plots reports on Sibuyan and rejects everything else', () => {
        expect(isValidHotspotCoordinate(REAL_REPORT.lat, REAL_REPORT.lng)).toBe(true);
        // The island's own west coast and south margin are inside the envelope.
        expect(isValidHotspotCoordinate(12.281974, 122.423577)).toBe(true);
        // Null island: the classic default-coordinate accident.
        expect(isValidHotspotCoordinate(0, 0)).toBe(false);
        // Another island in the province, and non-numeric junk.
        expect(isValidHotspotCoordinate(12.4, 122.3)).toBe(false);
        expect(isValidHotspotCoordinate(undefined, 122.55)).toBe(false);
        expect(isValidHotspotCoordinate(Number.NaN, Number.NaN)).toBe(false);
    });

    test('measures distance in real metres', () => {
        expect(haversineMeters(REAL_REPORT, REAL_REPORT)).toBe(0);
        expect(haversineMeters(REAL_REPORT, north(REAL_REPORT, 100))).toBeCloseTo(100, 1);
        expect(haversineMeters(REAL_REPORT, east(REAL_REPORT, 100))).toBeCloseTo(100, 1);
    });
});

describe('accident hotspot clustering', () => {
    test('reports within the radius of one anchor are one hotspot', () => {
        const hotspots = clusterAccidentReports(
            reportsAround(REAL_REPORT, [0, 20, 50, 90]),
            { radiusMeters: 100 }
        );

        expect(hotspots).toHaveLength(1);
        expect(hotspots[0].count).toBe(4);
        // The anchor is the first report considered, so the drawn 100 m circle is
        // centred on a real accident and contains every member. Stored to ~0.1 m,
        // which is finer than the circle it centres.
        expect(hotspots[0].lat).toBeCloseTo(REAL_REPORT.lat, 6);
        expect(hotspots[0].lng).toBeCloseTo(REAL_REPORT.lng, 6);
    });

    test('a report outside the radius starts its own hotspot', () => {
        const hotspots = clusterAccidentReports([
            REAL_REPORT,
            north(REAL_REPORT, 99),
            north(REAL_REPORT, 150),
        ], { radiusMeters: 100 });

        expect(hotspots).toHaveLength(2);
        expect(hotspots.map((hotspot) => hotspot.count)).toEqual([2, 1]);
    });

    test('a run of scattered accidents does not chain into one hotspot', () => {
        // A—B is 90 m and B—C is 90 m, but A—C is 180 m. Joining on distance to
        // each report's neighbour would call this one 180 m "hotspot", which is
        // not an area anyone can act on: membership is decided against the
        // anchor, so C opens its own.
        const hotspots = clusterAccidentReports([
            REAL_REPORT,
            north(REAL_REPORT, 90),
            north(REAL_REPORT, 180),
        ], { radiusMeters: 100 });

        expect(hotspots).toHaveLength(2);
        expect(hotspots[0].count).toBe(2);
        expect(hotspots[1].count).toBe(1);
    });

    test('is deterministic, and drops points that cannot be plotted', () => {
        const points = [REAL_REPORT, north(REAL_REPORT, 40), { lat: 0, lng: 0 }, { lat: null, lng: null }, { lat: 12.4, lng: 122.3 }];

        const first = clusterAccidentReports(points, { radiusMeters: 100 });
        const second = clusterAccidentReports(points, { radiusMeters: 100 });

        expect(first).toEqual(second);
        expect(first).toHaveLength(1);
        expect(first[0].count).toBe(2);
        // The anchor is stored to ~0.1 m: finer than the 100 m circle it centres.
        expect(clusterAccidentReports([], { radiusMeters: 100 })).toEqual([]);
        expect(clusterAccidentReports(null)).toEqual([]);
    });

    test('the radius is the parameter, not a constant baked into the code', () => {
        const points = [REAL_REPORT, north(REAL_REPORT, 150)];

        expect(clusterAccidentReports(points, { radiusMeters: 100 })).toHaveLength(2);
        // Widening the analysis window merges them, with no other change.
        expect(clusterAccidentReports(points, { radiusMeters: 250 })).toHaveLength(1);
        expect(clusterAccidentReports(points, { radiusMeters: 250 })[0].count).toBe(2);
    });
});

describe('accident hotspot classification', () => {
    const cluster = (count, offset = 0) => ({ lat: REAL_REPORT.lat + offset, lng: REAL_REPORT.lng, count });

    test('exactly 2, 3, 5 and 6 reports', () => {
        const classified = classifyHotspotClusters([
            cluster(2, 0),
            cluster(3, 0.001),
            cluster(5, 0.002),
            cluster(6, 0.003),
        ]);

        // Two accidents are two accidents: below the floor the hotspot is dropped
        // entirely rather than drawn faintly.
        expect(classified.some((entry) => entry.count === 2)).toBe(false);

        const byCount = Object.fromEntries(classified.map((entry) => [entry.count, entry.class]));
        expect(byCount[3]).toBe(ACCIDENT_HOTSPOT_CLASSES.medium);
        expect(byCount[5]).toBe(ACCIDENT_HOTSPOT_CLASSES.medium);
        expect(byCount[6]).toBe(ACCIDENT_HOTSPOT_CLASSES.high);

        // Worst first, so unchanged data produces identical bytes.
        expect(classified.map((entry) => entry.count)).toEqual([6, 5, 3]);
    });

    test('every count either side of the thresholds behaves', () => {
        const numbers = [1, 2, 3, 4, 5, 6, 7];
        const classes = numbers.map((count) => {
            const [entry] = classifyHotspotClusters([cluster(count)]);
            return entry ? entry.class : 'none';
        });

        expect(classes).toEqual(['none', 'none', 2, 2, 2, 3, 3]);
    });

    test('a configured rule changes the classification without touching the code', () => {
        const rule = { radiusMeters: 100, windowDays: 30, mediumMinReports: 2, highMinReports: 4 };

        expect(classifyHotspotClusters([cluster(2)], rule)[0].class).toBe(ACCIDENT_HOTSPOT_CLASSES.medium);
        expect(classifyHotspotClusters([cluster(4)], rule)[0].class).toBe(ACCIDENT_HOTSPOT_CLASSES.high);
        // The same two reports mean nothing under the shipped rule.
        expect(classifyHotspotClusters([cluster(2)])).toEqual([]);
    });
});

describe('accident hotspot layer payload', () => {
    test('six reports in one 100 m area are one High hotspot', () => {
        const layer = buildAccidentHotspotLayer(reportsAround(REAL_REPORT, [0, 20, 40, 60, 70, 80]));

        expect(layer.rule).toEqual(ACCIDENT_HOTSPOT_RULE_DEFAULTS);
        expect(layer.method).toBe('radius_cluster');
        expect(layer.derivedFromReports).toBe(true);
        expect(layer.classes).toEqual([
            { value: 2, label: 'Medium' },
            { value: 3, label: 'High' },
        ]);
        expect(layer.features).toHaveLength(1);
        expect(layer.features[0]).toMatchObject({
            type: 'Feature',
            properties: { class: ACCIDENT_HOTSPOT_CLASSES.high, count: 6 },
            geometry: { type: 'Point' },
        });
        const [lng, lat] = layer.features[0].geometry.coordinates;
        expect(lng).toBeCloseTo(REAL_REPORT.lng, 6);
        expect(lat).toBeCloseTo(REAL_REPORT.lat, 6);
        expect(layer.totals).toEqual({ reports: 6, hotspots: 1, clusteredReports: 6 });
    });

    test('two reports offshore of a hotspot are counted but not classified', () => {
        const layer = buildAccidentHotspotLayer([REAL_REPORT, north(REAL_REPORT, 30)]);

        expect(layer.features).toEqual([]);
        // Both facts are reported: reports happened, but not enough in one place.
        expect(layer.totals).toEqual({ reports: 2, hotspots: 0, clusteredReports: 0 });
    });

    test('reports in different places stay separate hotspots', () => {
        const layer = buildAccidentHotspotLayer([
            ...reportsAround(REAL_REPORT, [0, 20, 40]),
            ...reportsAround(north(REAL_REPORT, 900), [0, 20, 40]),
        ]);

        expect(layer.features).toHaveLength(2);
        expect(layer.features.map((feature) => feature.properties.class)).toEqual([2, 2]);
        expect(layer.totals).toEqual({ reports: 6, hotspots: 2, clusteredReports: 6 });
    });

    test('features are points carrying a class and a count, and nothing else', () => {
        const [feature] = buildHotspotFeatureCollection([
            { lat: REAL_REPORT.lat, lng: REAL_REPORT.lng, count: 4, class: ACCIDENT_HOTSPOT_CLASSES.medium },
        ]).features;

        expect(feature.geometry.coordinates).toEqual([REAL_REPORT.lng, REAL_REPORT.lat]);
        expect(feature.properties).toEqual({ class: 2, count: 4 });
    });

    test('a hotspot anchored by a report keeps that report\'s coordinate', () => {
        const layer = buildAccidentHotspotLayer(reportsAround(REAL_REPORT, [0, 20, 40]));

        // Anchored on a real accident rather than on an averaged point in the
        // middle of a field: the circle marks where the accidents happened.
        const [lng, lat] = layer.features[0].geometry.coordinates;
        expect(lat).toBeCloseTo(REAL_REPORT.lat, 6);
        expect(lng).toBeCloseTo(REAL_REPORT.lng, 6);
    });

    test('the payload states its rule and no report', () => {
        const layer = buildAccidentHotspotLayer(reportsAround(REAL_REPORT, [0, 20, 40]));

        // Derived from reports is not the same as exposing them. The query never
        // selects these fields, and this is the assertion that keeps a future
        // edit from adding one "for the tooltip".
        const serialized = JSON.stringify(layer);
        for (const forbidden of ['reporter', 'address', 'description', 'title', 'incidentTime', 'barangay', '_id']) {
            expect(serialized).not.toContain(forbidden);
        }
    });

    test('the validator notices a moved hotspot and a changed rule', () => {
        const base = buildAccidentHotspotLayer(reportsAround(REAL_REPORT, [0, 20, 40]));
        const sameAgain = buildAccidentHotspotLayer(reportsAround(REAL_REPORT, [0, 20, 40]));
        const moved = buildAccidentHotspotLayer(reportsAround(north(REAL_REPORT, 500), [0, 20, 40]));
        const otherRule = buildAccidentHotspotLayer(reportsAround(REAL_REPORT, [0, 20, 40]), {
            radiusMeters: 250,
            windowDays: 30,
            mediumMinReports: 3,
            highMinReports: 6,
        });

        expect(accidentHotspotValidator(sameAgain)).toBe(accidentHotspotValidator(base));
        expect(accidentHotspotValidator(moved)).not.toBe(accidentHotspotValidator(base));
        // A re-tuned rule is a different answer, so it must not be served from a
        // cache that was filled under the old one.
        expect(accidentHotspotValidator(otherRule)).not.toBe(accidentHotspotValidator(base));
    });
});

describe('GET /api/high-risk-zones/accident-hotspots', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUser = {
            _id: '507f1f77bcf86cd799439011',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        };
        getAccidentHotspotsMock.mockResolvedValue(
            buildAccidentHotspotLayer(reportsAround(REAL_REPORT, [0, 20, 40]))
        );
    });

    test('rejects a caller who is not a municipal administrator', async () => {
        mockUser = { _id: 'u-1', role: 'reporter' };

        await request(createApp()).get('/high-risk-zones/accident-hotspots').expect(403);
        expect(getAccidentHotspotsMock).not.toHaveBeenCalled();
    });

    test('returns the derived layer with a bounded query', async () => {
        const response = await request(createApp())
            .get('/high-risk-zones/accident-hotspots')
            .expect(200);

        // Bounded like every other query on the request path.
        expect(getAccidentHotspotsMock).toHaveBeenCalledWith({ maxTimeMS: 5000 });

        expect(response.body.success).toBe(true);
        expect(response.body.data).toMatchObject({
            datasetId: 'accident_hotspots',
            derivedFromReports: true,
            method: 'radius_cluster',
            rule: { radiusMeters: 100, windowDays: 30, mediumMinReports: 3, highMinReports: 6 },
            totals: { reports: 3, hotspots: 1, clusteredReports: 3 },
        });
        expect(response.body.data.features).toHaveLength(1);
        const [lng, lat] = response.body.data.features[0].geometry.coordinates;
        expect(lng).toBeCloseTo(REAL_REPORT.lng, 6);
        expect(lat).toBeCloseTo(REAL_REPORT.lat, 6);
    });

    test('answers a repeat with 304 once the hotspots are unchanged', async () => {
        const first = await request(createApp())
            .get('/high-risk-zones/accident-hotspots')
            .expect(200);

        expect(first.headers.etag).toEqual(expect.any(String));

        const second = await request(createApp())
            .get('/high-risk-zones/accident-hotspots')
            .set('If-None-Match', first.headers.etag)
            .expect(304);

        expect(second.text).toBeFalsy();
    });

    test('reports a failed derivation as a server error, not an empty map', async () => {
        getAccidentHotspotsMock.mockRejectedValue(new Error('query timed out'));

        const response = await request(createApp())
            .get('/high-risk-zones/accident-hotspots')
            .expect(500);

        // An empty layer would read as "no accidents are known", which is a claim
        // about the island rather than about the request.
        expect(response.body).toEqual({
            success: false,
            message: 'Failed to get accident-prone areas',
        });
    });
});
