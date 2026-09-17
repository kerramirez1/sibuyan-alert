import { beforeEach, describe, expect, test } from 'vitest';
import {
    REPORT_DRAFT_STORAGE_KEY,
} from '../config/reportSubmission';
import {
    buildDraftPayload,
    clearReportDraft,
    isDraftWorthy,
    loadReportDraft,
    saveReportDraft,
} from '../utils/reportDraft';

const baseForm = () => ({
    incidentCategory: 'accident',
    incidentType: 'vehicular',
    description: '',
    address: '',
    barangay: '',
    incidentTime: '',
    severity: 'moderate',
    casualties: { injured: '', fatalities: '', missing: '' },
});

beforeEach(() => {
    try {
        localStorage.clear();
    } catch {
        // jsdom without storage: each case still exercises the null path.
    }
});

describe('reportDraft', () => {
    test('a pristine form is not draft-worthy', () => {
        expect(isDraftWorthy({ formData: baseForm(), selectedLocation: null })).toBe(false);
    });

    test('text, location, casualty, or severity changes make a draft worthy', () => {
        expect(isDraftWorthy({
            formData: { ...baseForm(), address: 'Poblacion Market' },
            selectedLocation: null,
        })).toBe(true);
        expect(isDraftWorthy({
            formData: baseForm(),
            selectedLocation: { lat: 12.39, lng: 122.67 },
        })).toBe(true);
        expect(isDraftWorthy({
            formData: { ...baseForm(), casualties: { injured: '2', fatalities: '', missing: '' } },
            selectedLocation: null,
        })).toBe(true);
    });

    test('saves and restores fields without photos or tokens', () => {
        const formData = { ...baseForm(), address: 'Near Municipal Hall', incidentTime: '2025-02-01T08:00' };
        expect(saveReportDraft({
            formData,
            selectedLocation: { lat: 12.39261, lng: 122.67985 },
            locationCapture: { source: 'gps', accuracyMeters: 18, capturedAt: '2025-02-01T08:00:00Z' },
        })).toBe(true);

        const restored = loadReportDraft();
        expect(restored.formData.address).toBe('Near Municipal Hall');
        expect(restored.selectedLocation).toEqual({ lat: 12.39261, lng: 122.67985 });
        expect(restored.locationCapture.source).toBe('gps');

        const raw = localStorage.getItem(REPORT_DRAFT_STORAGE_KEY);
        expect(raw).not.toMatch(/images|token|jwt/i);
    });

    test('a pristine form clears any stored draft', () => {
        saveReportDraft({
            formData: { ...baseForm(), address: 'Poblacion' },
            selectedLocation: null,
            locationCapture: null,
        });
        expect(loadReportDraft()).not.toBeNull();

        saveReportDraft({ formData: baseForm(), selectedLocation: null, locationCapture: null });
        expect(loadReportDraft()).toBeNull();
    });

    test('expired or corrupt drafts are ignored', () => {
        saveReportDraft({
            formData: { ...baseForm(), address: 'Poblacion' },
            selectedLocation: null,
            locationCapture: null,
        });
        const raw = JSON.parse(localStorage.getItem(REPORT_DRAFT_STORAGE_KEY));
        // 8 days old: past the 7-day TTL.
        expect(loadReportDraft(raw.updatedAt + (8 * 24 * 60 * 60 * 1000))).toBeNull();

        localStorage.setItem(REPORT_DRAFT_STORAGE_KEY, 'not-json');
        expect(loadReportDraft()).toBeNull();
    });

    test('invalid coordinates are dropped instead of restored', () => {
        const payload = buildDraftPayload({
            formData: { ...baseForm(), address: 'Poblacion' },
            selectedLocation: { lat: Number.NaN, lng: 122.67 },
            locationCapture: null,
        });
        expect(payload.selectedLocation).toBeNull();
    });

    test('clearReportDraft removes the stored draft', () => {
        saveReportDraft({
            formData: { ...baseForm(), address: 'Poblacion' },
            selectedLocation: null,
            locationCapture: null,
        });
        expect(clearReportDraft()).toBe(true);
        expect(loadReportDraft()).toBeNull();
    });
});
