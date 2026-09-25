import { describe, expect, test, vi } from 'vitest';
import mongoose from 'mongoose';
import { ACCIDENT_HOTSPOT_SAFETY_CEILING } from '../config/accidentHotspots.js';
import {
    buildAccidentHotspotMatch,
} from '../utils/accidentHotspots.js';
import Report from '../models/Report.js';

describe('Report.getAccidentHotspots all-time cursor derivation', () => {
    test('buildAccidentHotspotMatch matches all validated statuses and omits incidentTime cutoff', () => {
        const match = buildAccidentHotspotMatch();
        expect(match.status.$in).toEqual(['verified', 'transferred', 'responding', 'resolved']);
        expect(match.status.$in).not.toContain('pending');
        expect(match.status.$in).not.toContain('rejected');
        expect(match.incidentTime).toBeUndefined();
    });

    test('streams all eligible reports across all historical dates via cursor', async () => {
        const baseCoord = { lat: 12.345053, lng: 122.676218 };
        // Reports spanning several months/years in the past
        const sampleDocs = [
            {
                _id: new mongoose.Types.ObjectId(),
                coordinates: { lat: baseCoord.lat, lng: baseCoord.lng },
                incidentTime: new Date('2024-01-15T08:00:00.000Z'),
            },
            {
                _id: new mongoose.Types.ObjectId(),
                coordinates: { lat: baseCoord.lat + 0.0001, lng: baseCoord.lng },
                incidentTime: new Date('2025-06-20T14:30:00.000Z'),
            },
            {
                _id: new mongoose.Types.ObjectId(),
                coordinates: { lat: baseCoord.lat, lng: baseCoord.lng + 0.0001 },
                incidentTime: new Date('2026-09-01T10:00:00.000Z'),
            },
        ];

        // Mock cursor async generator
        async function* mockCursorGenerator() {
            for (const doc of sampleDocs) {
                yield doc;
            }
        }

        const findSpy = vi.spyOn(Report, 'find').mockReturnValue({
            select: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            maxTimeMS: vi.fn().mockReturnThis(),
            lean: vi.fn().mockReturnValue({
                cursor: () => mockCursorGenerator(),
            }),
        });

        const layer = await Report.getAccidentHotspots();
        findSpy.mockRestore();

        expect(layer.scope).toBe('all_time');
        expect(layer.timeScope).toBe('all_time');
        expect(layer.rule.timeScope).toBe('all_time');
        expect(layer.rule.windowDays).toBeNull();
        expect(layer.totals.reports).toBe(3);
        expect(layer.totals.hotspots).toBe(1);
        expect(layer.totals.isComplete).toBe(true);
        expect(layer.totals.truncated).toBe(false);
        expect(layer.features).toHaveLength(1);
        expect(layer.features[0].properties.count).toBe(3);
    });

    test('processes more than 2,000 documents completely without arbitrary truncation', async () => {
        const baseCoord = { lat: 12.345053, lng: 122.676218 };
        const totalDocs = 2_500;

        async function* mockCursorGenerator() {
            for (let i = 0; i < totalDocs; i += 1) {
                yield {
                    _id: new mongoose.Types.ObjectId(),
                    coordinates: {
                        lat: baseCoord.lat + ((i % 5) * 0.002),
                        lng: baseCoord.lng - ((i % 5) * 0.002),
                    },
                    incidentTime: new Date(Date.now() - (i * 86400000)),
                };
            }
        }

        const findSpy = vi.spyOn(Report, 'find').mockReturnValue({
            select: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            maxTimeMS: vi.fn().mockReturnThis(),
            lean: vi.fn().mockReturnValue({
                cursor: () => mockCursorGenerator(),
            }),
        });

        const layer = await Report.getAccidentHotspots();
        findSpy.mockRestore();

        expect(layer.totals.reports).toBe(2500);
        expect(layer.totals.isComplete).toBe(true);
        expect(layer.totals.truncated).toBe(false);
    });

    test('enforces safety ceiling if document count exceeds limit', async () => {
        const baseCoord = { lat: 12.345053, lng: 122.676218 };

        async function* infiniteGenerator() {
            let i = 0;
            while (true) {
                yield {
                    _id: new mongoose.Types.ObjectId(),
                    coordinates: { lat: baseCoord.lat, lng: baseCoord.lng },
                    incidentTime: new Date(Date.now() - (i * 1000)),
                };
                i += 1;
            }
        }

        const findSpy = vi.spyOn(Report, 'find').mockReturnValue({
            select: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            maxTimeMS: vi.fn().mockReturnThis(),
            lean: vi.fn().mockReturnValue({
                cursor: () => infiniteGenerator(),
            }),
        });

        const layer = await Report.getAccidentHotspots();
        findSpy.mockRestore();

        expect(layer.totals.reports).toBe(ACCIDENT_HOTSPOT_SAFETY_CEILING);
        expect(layer.totals.isComplete).toBe(false);
        expect(layer.totals.truncated).toBe(true);
    });
});
