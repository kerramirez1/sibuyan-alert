import { describe, expect, test } from 'vitest';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import {
    ACCIDENT_HOTSPOT_CLASS_VALUES,
    ACCIDENT_HOTSPOT_DEFAULT_RULE,
    ACCIDENT_HOTSPOT_DISCLAIMER,
    ACCIDENT_HOTSPOT_HIGH_CLASS,
    ACCIDENT_HOTSPOT_MEDIUM_CLASS,
    ACCIDENT_HOTSPOT_MIN_RADIUS_PX,
    ACCIDENT_HOTSPOT_MIN_ZOOM,
    ACCIDENT_HOTSPOT_SOURCE_ID,
    accidentHotspotCircleLayerId,
    buildAccidentHotspotFilterExpression,
    buildAccidentHotspotRadiusExpression,
    describeEmptyHotspotClass,
    getAccidentHotspotClasses,
    getAccidentHotspotColor,
    getAccidentHotspotLegendLabel,
    getAccidentHotspotPaint,
    hotspotRadiusPixels,
    isRenderableAccidentHotspotFeature,
    metersPerPixel,
    resolveAccidentHotspotRule,
} from '../config/accidentHotspots';

const feature = (classValue, coordinates = [122.6762, 12.3451]) => ({
    type: 'Feature',
    properties: { class: classValue, count: 4 },
    geometry: { type: 'Point', coordinates },
});

describe('accident hotspot layer config', () => {
    test('declares the layer ids the map is built from', () => {
        // Literal expectations, deliberately: these ids are the contract between
        // the config and the map, and a rename here has to be visible.
        expect(ACCIDENT_HOTSPOT_SOURCE_ID).toBe('accident-hotspots');
        expect(accidentHotspotCircleLayerId(2)).toBe('accident-hotspot-medium-circle');
        expect(accidentHotspotCircleLayerId(3)).toBe('accident-hotspot-high-circle');
        // Unknown classes cannot collide with a real layer.
        expect(accidentHotspotCircleLayerId(7)).toBe('accident-hotspot-unknown-circle');
        // Drawn from the same zoom the susceptibility layers appear at.
        expect(ACCIDENT_HOTSPOT_MIN_ZOOM).toBe(10);
    });

    test('its default rule is the server rule', () => {
        // The server owns the analysis rule and sends it in the payload; this is
        // only the fallback for a payload that carries none. Asserted literally on
        // both sides so a drift between them fails a test instead of drawing a
        // radius the data was not derived with.
        expect(ACCIDENT_HOTSPOT_DEFAULT_RULE).toEqual({
            radiusMeters: 100,
            windowDays: 30,
            mediumMinReports: 3,
            highMinReports: 6,
        });
    });

    test('resolves the rule from the payload, and never invents a zero', () => {
        const rule = resolveAccidentHotspotRule({
            rule: { radiusMeters: 250, windowDays: 7, mediumMinReports: 2, highMinReports: 4 },
        });
        expect(rule).toEqual({ radiusMeters: 250, windowDays: 7, mediumMinReports: 2, highMinReports: 4 });

        // A payload with no rule — an older cached snapshot — still renders, with
        // the documented defaults rather than with zeros.
        expect(resolveAccidentHotspotRule({})).toEqual(ACCIDENT_HOTSPOT_DEFAULT_RULE);
        expect(resolveAccidentHotspotRule(null)).toEqual(ACCIDENT_HOTSPOT_DEFAULT_RULE);
        expect(resolveAccidentHotspotRule({
            rule: { radiusMeters: 0, windowDays: null, mediumMinReports: 'x' },
        })).toEqual(ACCIDENT_HOTSPOT_DEFAULT_RULE);
    });

    test('the radius is 100 m of ground, not 100 pixels', () => {
        // MapLibre renders a 512 px world, so the equator is 78 271.5 m/px at
        // zoom 0 and it halves with every level.
        expect(metersPerPixel(0, 0)).toBeCloseTo(78271.517, 3);
        expect(metersPerPixel(13, 0)).toBeCloseTo(78271.517 / 8192, 3);

        // A 100 m hotspot is ~11 px at barangay zoom and ~86 px at the
        // operational ceiling — the ratio that makes the drawn circle the
        // analysis area rather than a decorative dot.
        expect(hotspotRadiusPixels(13, 100)).toBeCloseTo(10.72, 1);
        expect(hotspotRadiusPixels(16, 100)).toBeCloseTo(85.73, 1);
        expect(hotspotRadiusPixels(13, 200) / hotspotRadiusPixels(13, 100)).toBeCloseTo(2, 6);
    });

    test('the ramp doubles with each zoom level, which is what Mercator does', () => {
        const expression = buildAccidentHotspotRadiusExpression(100);

        // Clamped to a legible minimum for the island overview…
        expect(expression[0]).toBe('max');
        expect(expression[2]).toBe(ACCIDENT_HOTSPOT_MIN_RADIUS_PX);

        const ramp = expression[1];
        expect(ramp[0]).toBe('interpolate');
        // Base-2 exponential: the ground scale doubles per level, so two stops are
        // exact at every zoom between them.
        expect(ramp[1]).toEqual(['exponential', 2]);
        expect(ramp[2]).toEqual(['zoom']);

        const stops = ramp.slice(3);
        expect(stops).toEqual([10, stops[1], 13, stops[3], 16, stops[5]]);
        expect(stops[1]).toBeCloseTo(1.34, 2);
        expect(stops[3] / stops[1]).toBeCloseTo(8, 1);
        expect(stops[5] / stops[3]).toBeCloseTo(8, 1);
    });

    test('a wider rule draws a wider circle without touching the code', () => {
        const narrow = buildAccidentHotspotRadiusExpression(100)[1].slice(3);
        const wide = buildAccidentHotspotRadiusExpression(250)[1].slice(3);

        expect(wide[3]).toBeCloseTo(narrow[3] * 2.5, 2);
        // A missing or nonsense radius falls back to the documented default
        // rather than drawing a zero-size circle.
        expect(buildAccidentHotspotRadiusExpression(0)).toEqual(buildAccidentHotspotRadiusExpression(100));
        expect(buildAccidentHotspotRadiusExpression(undefined)).toEqual(buildAccidentHotspotRadiusExpression(100));
    });

    test('the expression is one MapLibre accepts, at the size it claims', () => {
        const expression = buildAccidentHotspotRadiusExpression(100);
        const compiled = createExpression(expression);

        // A malformed expression would only fail in the browser, where jsdom
        // cannot see it, so it is checked against MapLibre's own style spec here.
        expect(compiled.result).toBe('success');

        const radiusAt = (zoom) => compiled.value.evaluate({ zoom }, {});
        expect(radiusAt(16)).toBeCloseTo(85.73, 1);
        expect(radiusAt(13)).toBeCloseTo(10.72, 1);
        // Below ~zoom 12.4 the true circle is smaller than a legible dot.
        expect(radiusAt(10)).toBe(ACCIDENT_HOTSPOT_MIN_RADIUS_PX);
        expect(radiusAt(12.4)).toBeCloseTo(7.07, 1);
    });

    test('both classes draw the same area, and differ in intensity', () => {
        const medium = getAccidentHotspotPaint(ACCIDENT_HOTSPOT_MEDIUM_CLASS);
        const high = getAccidentHotspotPaint(ACCIDENT_HOTSPOT_HIGH_CLASS);

        // Size is not the class difference: a bigger medium dot would misstate
        // where the hotspot ends.
        expect(Object.hasOwn(medium, 'radiusStops')).toBe(false);
        expect(Object.hasOwn(high, 'radiusStops')).toBe(false);

        expect(high.fillOpacity).toBeGreaterThan(medium.fillOpacity);
        expect(high.strokeWidth).toBeGreaterThan(medium.strokeWidth);
        expect(medium.color).not.toBe(high.color);

        // The landslide susceptibility ramp is amber/red; the derived layer must
        // not be mistakable for it where both are on at once.
        for (const hazardColour of ['#F79009', '#D92D20', '#FCD34D']) {
            expect([medium.color, high.color]).not.toContain(hazardColour);
        }

        // A class with no rule paints nothing rather than a grey third severity.
        expect(getAccidentHotspotPaint(9)).toBeNull();
        expect(getAccidentHotspotColor(9)).toBe('#6B7280');
    });

    test('names the two classes the server derives, and only those', () => {
        expect([...ACCIDENT_HOTSPOT_CLASS_VALUES]).toEqual([2, 3]);
        expect(getAccidentHotspotClasses({ classes: [{ value: 3 }] })).toEqual([3]);
        expect(getAccidentHotspotClasses({ classes: [{ value: 99 }] })).toEqual([2, 3]);
        expect(getAccidentHotspotClasses(null)).toEqual([2, 3]);

        expect(getAccidentHotspotLegendLabel(2)).toBe('Medium Accident-Prone Area');
        expect(getAccidentHotspotLegendLabel(3)).toBe('High Accident-Prone Area');
        expect(ACCIDENT_HOTSPOT_DISCLAIMER).toMatch(/not an official government hazard/i);
    });

    test('an empty class explains itself in the rule\u2019s own terms', () => {
        const rule = resolveAccidentHotspotRule({});

        expect(describeEmptyHotspotClass(rule, 2)).toBe(
            'No area with 3+ validated reports within 100 m in the last 30 days.'
        );
        expect(describeEmptyHotspotClass(rule, 3)).toBe(
            'No area with 6+ validated reports within 100 m in the last 30 days.'
        );
        // A retuned rule is described as it is, not as it used to be.
        expect(describeEmptyHotspotClass(resolveAccidentHotspotRule({
            rule: { radiusMeters: 250, mediumMinReports: 2 },
        }), 2)).toBe('No area with 2+ validated reports within 250 m in the last 30 days.');
    });

    test('selects each class out of the shared source with a filter', () => {
        expect(buildAccidentHotspotFilterExpression(2)).toEqual(['==', ['get', 'class'], 2]);
        expect(buildAccidentHotspotFilterExpression(3)).toEqual(['==', ['get', 'class'], 3]);
    });

    test('accepts only points with a class it can draw', () => {
        expect(isRenderableAccidentHotspotFeature(feature(2))).toBe(true);
        expect(isRenderableAccidentHotspotFeature(feature(3))).toBe(true);
        // An undocumented class, a non-point geometry and a broken coordinate all
        // fail the same way: dropped, not painted with the fallback colour.
        expect(isRenderableAccidentHotspotFeature(feature(9))).toBe(false);
        expect(isRenderableAccidentHotspotFeature({
            type: 'Feature',
            properties: { class: 2, count: 1 },
            geometry: { type: 'MultiPolygon', coordinates: [] },
        })).toBe(false);
        expect(isRenderableAccidentHotspotFeature(feature(2, [Number.NaN, 12.35]))).toBe(false);
        expect(isRenderableAccidentHotspotFeature(null)).toBe(false);
    });
});
