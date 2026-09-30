import { describe, expect, test } from 'vitest';
import {
    getOperationalMarkerSvg,
    getRiskZoneMarkerSvg,
    getSelectedLocationMarkerSvg,
    getMapPinSvg,
    createOperationalMarkerElement,
    createRiskZoneMarkerElement,
    shadeHexColor,
    STATUS_PIN_PALETTES,
    INCIDENT_MARKER_SIZE,
    RESPONDING_DOT_SIZE,
    RESPONDING_DOT_LEGEND_SIZE,
    SELECTED_MARKER_SIZE,
} from '../utils/mapMarkerVisuals';
import { MAP_STATUS_CONFIG, MAP_RISK_ZONE_CONFIG } from '../config/mapVisuals';

describe('mapMarkerVisuals', () => {
    test('generates teardrop pin SVG for all incident statuses', () => {
        const statuses = ['pending', 'verified', 'transferred', 'responding', 'resolved', 'rejected'];

        statuses.forEach((status) => {
            const svg = getOperationalMarkerSvg(status, MAP_STATUS_CONFIG[status].markerColor);
            expect(svg).toContain('<svg');
            expect(svg).toContain('viewBox="0 0 24 32"');
            expect(svg).toContain('<path'); // Teardrop silhouette
            expect(svg).toContain('linearGradient'); // Matte depth gradient
            expect(svg).toContain(MAP_STATUS_CONFIG[status].markerColor);
        });
    });

    test('all incident teardrop pins have a uniform white center dot', () => {
        const statuses = ['pending', 'verified', 'transferred', 'responding', 'resolved', 'rejected'];

        statuses.forEach((status) => {
            const svg = getMapPinSvg({ status });
            expect(svg).toContain('<circle cx="12" cy="10.5" r="3" fill="white"/>');
        });
    });

    test('hazard zone pin uses a white exclamation glyph instead of the incident dot', () => {
        const svg = getMapPinSvg({ status: 'risk' });
        expect(svg).not.toContain('<circle cx="12" cy="10.5" r="3" fill="white"/>');
        expect(svg).toContain('<rect x="11" y="5.5" width="2" height="6"');
    });

    test('getMapPinSvg uses linear gradient for matte depth, not candy radial sheen', () => {
        const svg = getMapPinSvg({ status: 'verified' });
        expect(svg).toContain('linearGradient');
        expect(svg).not.toContain('radialGradient');
        expect(svg).toContain(STATUS_PIN_PALETTES.verified.base);
        expect(svg).toContain(STATUS_PIN_PALETTES.verified.dark);
    });

    test('teardrop pin has no white border outline', () => {
        const svg = getMapPinSvg({ status: 'pending' });
        expect(svg).not.toContain('stroke="#FFFFFF"');
    });

    test('generates teardrop pin for high-risk zones', () => {
        const svg = getRiskZoneMarkerSvg(MAP_RISK_ZONE_CONFIG.markerColor);
        expect(svg).toContain('<svg');
        expect(svg).toContain('viewBox="0 0 24 32"');
        expect(svg).toContain('<path');
        expect(svg).toContain(MAP_RISK_ZONE_CONFIG.markerColor);
    });

    test('generates selected location teardrop pin', () => {
        const svg = getSelectedLocationMarkerSvg();
        expect(svg).toContain('<svg');
        expect(svg).toContain('#EF4444');
        expect(svg).toContain('<path');
    });

    /**
     * These four tests replaced an earlier set that asserted the opposite — that
     * a responding marker carried no pulse DOM at all, because the pulse and its
     * halo had been removed for being louder than the incident they described.
     *
     * The reversal is deliberate, and it is safe for one reason: the cue is now
     * the marker's *shape* (a dot, not a teardrop) and the ring is hollow, so the
     * state reads with no motion at all. What the old tests were protecting
     * against — a 36px halo of three filled discs glowing behind a pin that could
     * not otherwise be told apart from a verified one — cannot come back without
     * deleting the dot and un-hollowing the ring in the same change.
     */
    test('draws a responding incident on the public map as a dot with a pulse', () => {
        const report = {
            id: 'rep-1',
            status: 'responding',
            title: 'Motorcycle collision',
        };

        const el = createOperationalMarkerElement({
            report,
            groupedReports: [report],
            markerColor: '#2563EB',
            respondingDot: true,
        });

        expect(el.className).toContain('report-marker');
        expect(el.className).toContain('report-marker--responding');
        expect(el.getAttribute('role')).toBe('button');
        expect(el.getAttribute('tabindex')).toBe('0');
        // The dot replaces the pin outright: no teardrop, no gradient.
        expect(el.innerHTML).not.toContain('<svg');
        expect(el.innerHTML).not.toContain('linearGradient');
        // ...and the pulse is the shared kit, not a private ring.
        expect(el.innerHTML).toContain('pulse-marker"');
        expect(el.innerHTML).toContain('--pulse-color:#2563EB');
        // A full three-wave train, like the hazard radar's: one ring leaves on
        // every beat and the sweep never gaps. Fewer rings is what this used to
        // ship, and it is the one thing the radar treatment changes about the
        // markup — the ring stays hollow, so the cue is still the quiet one.
        expect((el.innerHTML.match(/pulse-marker__wave/g) || [])).toHaveLength(3);
        expect((el.innerHTML.match(/pulse-marker__core/g) || [])).toHaveLength(1);
        expect(el.innerHTML).not.toContain('pulse-marker--filled');
        // A pulse is invisible to a screen reader, so the state is in the name.
        expect(el.getAttribute('aria-label'))
            .toBe('Motorcycle collision map marker, being responded to');
        expect(el.getAttribute('title')).toBe(el.getAttribute('aria-label'));
    });

    test('still builds a plain pin when the caller asks for one', () => {
        const report = { id: 'rep-ops', status: 'responding', title: 'Boat capsizing' };

        const el = createOperationalMarkerElement({
            report,
            groupedReports: [report],
            markerColor: MAP_STATUS_CONFIG.responding.markerColor,
            // No map passes `false` for responding any more; the option is kept
            // because the builder still owns both shapes (see the dot test above).
            respondingDot: false,
        });

        expect(el.className).not.toContain('report-marker--responding');
        expect(el.innerHTML).toContain('<svg');
        expect(el.innerHTML).not.toContain('pulse-marker');
        expect(el.getAttribute('aria-label')).toBe('Boat capsizing map marker');
        expect(el.hasAttribute('title')).toBe(false);
    });

    test('sizes the responding dot to the pin it stands among, not bigger', () => {
        // The pin renders a 24x32 viewBox at 12x17px, so its head circle (r=9 in
        // the viewBox) is 9px across. That is the mark a reader's eye compares,
        // so it is the mark the dot's core has to match.
        const viewBoxHeadDiameter = 18;
        const viewBoxWidth = 24;
        const pinHead = (viewBoxHeadDiameter / viewBoxWidth) * INCIDENT_MARKER_SIZE.width;

        expect(RESPONDING_DOT_SIZE.core).toBe(pinHead);
        // The animated ring may reach past the pin's width, but it must stay
        // inside the envelope the neighbouring pins occupy. A footprint wider
        // than the pin is tall made the responding dot the largest mark on the
        // public map, which is how motion draws attention - not size.
        expect(RESPONDING_DOT_SIZE.footprint).toBeGreaterThan(INCIDENT_MARKER_SIZE.width);
        expect(RESPONDING_DOT_SIZE.footprint).toBeLessThanOrEqual(INCIDENT_MARKER_SIZE.height);
    });

    test('scales the legend swatch to the legend row it sits in', () => {
        // Legend pin symbols are 8px circles (`h-2 w-2` in MapLegend), so the
        // dot's core is 8px too, and the ring only needs room around that.
        expect(RESPONDING_DOT_LEGEND_SIZE.core).toBe(8);
        expect(RESPONDING_DOT_LEGEND_SIZE.footprint).toBeGreaterThan(RESPONDING_DOT_LEGEND_SIZE.core);
        expect(RESPONDING_DOT_LEGEND_SIZE.footprint).toBeLessThan(RESPONDING_DOT_SIZE.footprint);
    });

    test('writes the dot geometry onto the marker so CSS never guesses it', () => {
        const report = { id: 'rep-geo', status: 'responding', title: 'Landslide' };

        const el = createOperationalMarkerElement({
            report,
            groupedReports: [report],
            markerColor: '#2563EB',
            respondingDot: true,
        });

        expect(el.innerHTML).toContain(`--pulse-size:${RESPONDING_DOT_SIZE.footprint}px`);
        expect(el.innerHTML).toContain(`--pulse-core:${RESPONDING_DOT_SIZE.core}px`);
        // The hazard radar keeps its own size; only the incident dot is sized
        // from the pin, so the two cues cannot borrow each other's numbers.
        const zone = createRiskZoneMarkerElement({ zone: { name: 'Cajidiang' } });
        expect(zone.innerHTML).not.toContain('--pulse-size');
    });

    test('never ships a JS-side motion gate on the responding pulse', () => {
        const report = { id: 'rep-static', status: 'responding', title: 'Flooded road' };

        const el = createOperationalMarkerElement({
            report,
            groupedReports: [report],
            markerColor: '#2563EB',
            respondingDot: true,
            // What MapView used to pass from `performanceProfile.markerAnimations`.
            // Dropped on purpose: on a `resourceConstrained` device that froze the
            // dot while the hazard radar beside it kept sweeping, because the flag
            // could not agree with `prefers-reduced-motion` about the same CSS
            // animation. The media query owns that decision now, so the marker is
            // byte-identical whatever a stale caller passes.
            motion: false,
        });

        expect(el.className.split(' ').sort()).toEqual([
            'report-marker',
            'report-marker--responding',
        ]);
        // The ring is still there and still travelling: the freeze lives in CSS
        // now, and only under `prefers-reduced-motion`.
        expect(el.innerHTML).toContain('pulse-marker__core');
        expect(el.innerHTML).toContain('pulse-marker__wave');
    });

    test('non-responding markers carry no responding modifier', () => {
        const report = { id: 'rep-2', status: 'verified', title: 'Incident V' };

        const el = createOperationalMarkerElement({
            report,
            groupedReports: [report],
            markerColor: '#2563EB',
            respondingDot: true,
        });

        expect(el.className).toBe('report-marker');
        expect(el.className).not.toContain('report-marker--responding');
        expect(el.innerHTML).not.toContain('pulse-marker');
        expect(el.innerHTML).toContain('<svg');
    });

    test('tells the truth about how many co-located incidents are being handled', () => {
        const verified = { id: 'rep-3', status: 'verified', title: 'Spill' };
        const responding = { id: 'rep-4', status: 'responding', title: 'Spill' };

        const el = createOperationalMarkerElement({
            report: responding,
            groupedReports: [verified, responding],
            markerColor: '#2563EB',
            respondingDot: true,
        });

        expect(el.getAttribute('aria-label'))
            .toBe('2 incidents at this location, including one being responded to');
        expect(el.innerHTML).toContain('report-marker__count');
        expect(el.innerHTML).toContain('>2<');
    });

    test('names both facts when one spot is unverified and being handled', () => {
        const pending = { id: 'rep-5', status: 'pending', title: 'Debris' };
        const responding = { id: 'rep-6', status: 'responding', title: 'Debris' };

        const el = createOperationalMarkerElement({
            report: responding,
            groupedReports: [pending, responding],
            markerColor: '#2563EB',
            respondingDot: true,
        });

        // The dot says "responding" and the colour would have said "unverified",
        // so the name has to say both: an accessibility label that silently drops
        // one of its two facts is worse than one that is a few words longer.
        expect(el.getAttribute('aria-label'))
            .toBe('2 incidents at this location, including unverified and one being responded to');
    });

    test('shadeHexColor derives a same-hue lower tone and passes through bad input', () => {
        const shaded = shadeHexColor('#2563EB');
        expect(shaded).toMatch(/^#[0-9A-F]{6}$/);
        expect(shaded).not.toBe('#2563EB');
        // Same hue family: blue stays dominant.
        const r = parseInt(shaded.slice(1, 3), 16);
        const b = parseInt(shaded.slice(5, 7), 16);
        expect(b).toBeGreaterThan(r);
        expect(shadeHexColor('not-a-color')).toBe('not-a-color');
        expect(shadeHexColor(null)).toBe(null);
    });

    test('explicit override colors never leak another status hue into the gradient', () => {
        // A pin painted an explicit blue must be blue top-to-bottom, not blue over
        // the amber lower tone of the status it nominally carries. (The handled
        // states now share one blue, so a same-hue status could no longer show
        // this leak.)
        const svg = getOperationalMarkerSvg('pending', '#2563EB');
        expect(svg).toContain('#2563EB');
        expect(svg).not.toContain(STATUS_PIN_PALETTES.pending.dark);
    });

    test('createOperationalMarkerElement attaches grouped count badge for multi-incident locations', () => {
        const report1 = { id: 'rep-1', status: 'verified', title: 'Incident A' };
        const report2 = { id: 'rep-2', status: 'pending', title: 'Incident B' };
        const report3 = { id: 'rep-3', status: 'verified', title: 'Incident C' };

        const el = createOperationalMarkerElement({
            report: report1,
            groupedReports: [report1, report2, report3],
            markerColor: '#2563EB',
        });

        expect(el.getAttribute('aria-label')).toBe('3 incidents at this location, including unverified');
        expect(el.getAttribute('title')).toBe('3 incidents at this location, including unverified');
        expect(el.innerHTML).toContain('>3<');
    });

    test('createOperationalMarkerElement labels single pending pins as unverified', () => {
        const report = { id: 'rep-9', status: 'pending', title: 'Incident P' };

        const el = createOperationalMarkerElement({
            report,
            groupedReports: [report],
            markerColor: '#F59E0B',
        });

        expect(el.getAttribute('aria-label')).toBe('Unverified report');
        expect(el.getAttribute('title')).toBe('Unverified report');
    });

    test('createRiskZoneMarkerElement configures accessible attributes', () => {
        const zone = {
            id: 'zone-1',
            name: 'Cambajao River Overflow',
            type: 'accident_prone',
        };

        const el = createRiskZoneMarkerElement({
            zone,
            color: '#DC2626',
        });

        expect(el.className).toBe('zone-marker');
        expect(el.getAttribute('role')).toBe('button');
        expect(el.getAttribute('tabindex')).toBe('0');
        expect(el.getAttribute('aria-label')).toBe('Cambajao River Overflow map marker');
        // The hazard radar is a consumer of the shared pulse kit, not a private
        // set of classes: that is what lets the responding dot reuse the same
        // keyframes and the same beat without copying them.
        expect(el.innerHTML).toContain('pulse-marker');
        expect(el.innerHTML).toContain('pulse-marker--filled');
        expect(el.innerHTML).toContain('pulse-marker__core');
    });

    test('zone marker core is pure red — no white border, ring, stroke, or halo', () => {
        const el = createRiskZoneMarkerElement({
            zone: { id: 'zone-2', name: 'Mount Guiting Ridge', type: 'landslide_prone' },
            color: MAP_RISK_ZONE_CONFIG.markerColor,
        });

        expect(el.innerHTML).toContain(MAP_RISK_ZONE_CONFIG.markerColor);
        // The previous teardrop hazard pin painted a white exclamation glyph
        // inside a white-bordered silhouette. The radar core carries neither.
        expect(el.innerHTML).not.toContain('white');
        expect(el.innerHTML).not.toContain('#FFFFFF');
        expect(el.innerHTML).not.toContain('#ffffff');
        expect(el.innerHTML).not.toContain('stroke');
        expect(el.innerHTML).not.toContain('<path');
    });

    test('zone marker renders a three-ring radar pulse around a single core', () => {
        const el = createRiskZoneMarkerElement({
            zone: { id: 'zone-3', name: 'Cambajao River Overflow', type: 'flood_prone' },
            color: MAP_RISK_ZONE_CONFIG.markerColor,
        });

        // Three waves, so the sweep is continuous instead of a single blink
        // with a dead gap between beats.
        expect(el.innerHTML.match(/pulse-marker__wave/g)).toHaveLength(3);
        // Exactly one core dot for them to emanate from.
        expect(el.innerHTML.match(/pulse-marker__core/g)).toHaveLength(1);
        // The stagger is per-ring CSS, never inline markup.
        expect(el.innerHTML).not.toContain('animation-delay');

        // No duration is baked into the markup either: the beat comes from the
        // shared `--marker-beat` in index.css. Hard-coding one here is what
        // would let the radar drift out of step with the rest of the marker
        // system.
        expect(el.innerHTML).not.toContain('--zone-core-pulse');
        expect(el.innerHTML).not.toContain('animation-duration');
        // The colour is passed as the kit's own token, so both consumers name
        // their colour the same way.
        expect(el.innerHTML).toContain('--pulse-color:');
    });

    test('zone marker defaults to the hazard red when no color is supplied', () => {
        const el = createRiskZoneMarkerElement({
            zone: { id: 'zone-4', name: 'Unnamed zone', type: 'other' },
        });

        expect(el.innerHTML).toContain(MAP_RISK_ZONE_CONFIG.markerColor);
    });
});

describe('incident marker sizing', () => {
    const sizeAttr = `width="${INCIDENT_MARKER_SIZE.width}" height="${INCIDENT_MARKER_SIZE.height}"`;

    test('every incident marker renders at the one declared size', () => {
        const report = { _id: 'r1', status: 'verified', title: 'Incident' };
        const el = createOperationalMarkerElement({
            report,
            groupedReports: [report],
            markerColor: '#2563EB',
        });

        // The glyph itself...
        expect(el.innerHTML).toContain(sizeAttr);
        // ...and the body that positions it. The body and the count badge are
        // sized from these two custom properties in index.css, which is what
        // makes one number control the whole pin.
        expect(el.innerHTML).toContain(`--marker-w:${INCIDENT_MARKER_SIZE.width}px`);
        expect(el.innerHTML).toContain(`--marker-h:${INCIDENT_MARKER_SIZE.height}px`);
    });

    test('every pin-producing helper shares the incident size by default', () => {
        // Six surfaces mount MapView. None of them may pass a size, and none of
        // these helpers may carry a private default, or the maps drift apart.
        expect(getOperationalMarkerSvg('verified', '#2563EB')).toContain(sizeAttr);
        expect(getRiskZoneMarkerSvg('#DC2626')).toContain(sizeAttr);
    });

    test('the draggable placement pin matches the public marker size', () => {
        expect(getSelectedLocationMarkerSvg()).toContain(
            `width="${SELECTED_MARKER_SIZE.width}" height="${SELECTED_MARKER_SIZE.height}"`,
        );
        expect(SELECTED_MARKER_SIZE.width).toBe(INCIDENT_MARKER_SIZE.width);
        expect(SELECTED_MARKER_SIZE.height).toBe(INCIDENT_MARKER_SIZE.height);
    });

    test('builds a visual-only pin when interactive is false', () => {
        const report = { id: 'rep-preview', status: 'verified', title: 'Fallen tree' };

        const el = createOperationalMarkerElement({
            report,
            groupedReports: [report],
            markerColor: '#2563EB',
            interactive: false,
        });

        // Still a pin with the same body markup, at the caller's coordinates.
        expect(el.className).toContain('report-marker');
        expect(el.innerHTML).toContain('<svg');
        // But not exposed as a button, not focusable, no pointer cursor, and
        // hidden from assistive tech (the panel around it already names the
        // location in text).
        expect(el.hasAttribute('role')).toBe(false);
        expect(el.hasAttribute('tabindex')).toBe(false);
        expect(el.getAttribute('aria-hidden')).toBe('true');
        expect(el.style.cursor).not.toBe('pointer');
        expect(el.hasAttribute('aria-label')).toBe(false);
        expect(el.hasAttribute('title')).toBe(false);
    });
});
