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

    test('createOperationalMarkerElement puts the responding beat on a halo behind the pin', () => {
        const report = {
            id: 'rep-1',
            status: 'responding',
            title: 'Motorcycle collision',
        };

        const el = createOperationalMarkerElement({
            report,
            groupedReports: [report],
            markerColor: '#0891B2',
        });

        expect(el.className).toContain('report-marker');
        expect(el.className).toContain('report-marker--responding');
        expect(el.getAttribute('role')).toBe('button');
        expect(el.getAttribute('tabindex')).toBe('0');
        expect(el.getAttribute('aria-label')).toBe('Motorcycle collision map marker');
        // The beat sits on a halo element BEHIND the pin, so the pin itself
        // never moves. The old 30px ring is gone for good — it out-shouted the
        // high-risk zone indicator.
        // Three staggered rings, so the marker shows a sequence of waves rather
        // than one on/off blink. The stagger itself is CSS nth-child delays.
        expect(el.innerHTML.match(/report-marker__halo/g)).toHaveLength(3);
        expect(el.innerHTML).not.toContain('report-marker__pulse');
        expect(el.innerHTML).not.toContain('zone-marker__ripple');
    });

    test('non-responding pins carry no halo', () => {
        const report = { id: 'rep-2', status: 'verified', title: 'Incident V' };

        const el = createOperationalMarkerElement({
            report,
            groupedReports: [report],
            markerColor: '#2563EB',
        });

        expect(el.className).toBe('report-marker');
        expect(el.className).not.toContain('report-marker--responding');
        expect(el.innerHTML).not.toContain('report-marker__halo');
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
        // Unified public pin: transferred status painted verified-blue must be
        // blue top-to-bottom, not blue over the transferred purple dark tone.
        const svg = getOperationalMarkerSvg('transferred', '#2563EB');
        expect(svg).toContain('#2563EB');
        expect(svg).not.toContain(STATUS_PIN_PALETTES.transferred.dark);
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
        expect(el.innerHTML).toContain('zone-marker__radar');
        expect(el.innerHTML).toContain('zone-marker__core');
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

        // Three rings, so the sweep is continuous instead of a single blink
        // with a dead gap between beats.
        expect(el.innerHTML.match(/zone-marker__ripple/g)).toHaveLength(3);
        // Exactly one core dot for them to emanate from.
        expect(el.innerHTML.match(/zone-marker__core/g)).toHaveLength(1);
        // The stagger is per-ring CSS, never inline markup.
        expect(el.innerHTML).not.toContain('animation-delay');

        // No duration is baked into the markup either: the beat comes from the
        // shared `--marker-beat` in index.css, which the responding incident pin
        // reads too. Hard-coding one here is what would let the two "look here"
        // cues drift apart.
        expect(el.innerHTML).not.toContain('--zone-core-pulse');
        expect(el.innerHTML).not.toContain('animation-duration');
        expect(el.innerHTML).toContain('--zone-radar-color:');
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
        // ...and the body that positions it. The halo and the count badge are
        // sized from these two custom properties in index.css, which is what
        // makes one number control the whole marker.
        expect(el.innerHTML).toContain(`--marker-w:${INCIDENT_MARKER_SIZE.width}px`);
        expect(el.innerHTML).toContain(`--marker-h:${INCIDENT_MARKER_SIZE.height}px`);
    });

    test('every pin-producing helper shares the incident size by default', () => {
        // Six surfaces mount MapView. None of them may pass a size, and none of
        // these helpers may carry a private default, or the maps drift apart.
        expect(getOperationalMarkerSvg('verified', '#2563EB')).toContain(sizeAttr);
        expect(getRiskZoneMarkerSvg('#DC2626')).toContain(sizeAttr);
    });

    test('the draggable placement pin is its own size and stays larger', () => {
        expect(getSelectedLocationMarkerSvg()).toContain(
            `width="${SELECTED_MARKER_SIZE.width}" height="${SELECTED_MARKER_SIZE.height}"`,
        );
        expect(SELECTED_MARKER_SIZE.width).toBeGreaterThan(INCIDENT_MARKER_SIZE.width);
    });
});
