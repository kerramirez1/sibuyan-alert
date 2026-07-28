import { describe, expect, test } from 'vitest';
import { assessGpsAccuracy, GPS_MAX_ACCURACY_METERS, isValidLocation } from '../utils/locationQuality';

describe('location quality policy', () => {
    test('accepts precise and usable GPS readings', () => {
        expect(assessGpsAccuracy(12)).toMatchObject({ usable: true, precise: true });
        expect(assessGpsAccuracy(GPS_MAX_ACCURACY_METERS)).toMatchObject({ usable: true, precise: false });
    });

    test('rejects imprecise or invalid GPS readings', () => {
        expect(assessGpsAccuracy(101).usable).toBe(false);
        expect(assessGpsAccuracy(undefined).usable).toBe(false);
    });

    test('requires a finite latitude and longitude', () => {
        expect(isValidLocation({ lat: 12.4, lng: 122.6 })).toBe(true);
        expect(isValidLocation({ lat: 12.4, lng: Number.NaN })).toBe(false);
    });
});
