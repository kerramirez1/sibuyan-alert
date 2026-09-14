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

    test('createOperationalMarkerElement sets up accessible role, aria-label, and pulse on responding', () => {
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
        expect(el.innerHTML).toContain('report-marker__pulse');
        expect(el.innerHTML).not.toContain('report-marker__halo');
    });

    test('non-responding pins carry no responding halo or pulse', () => {
        const report = { id: 'rep-2', status: 'verified', title: 'Incident V' };

        const el = createOperationalMarkerElement({
            report,
            groupedReports: [report],
            markerColor: '#2563EB',
        });

        expect(el.className).toBe('report-marker');
        expect(el.innerHTML).not.toContain('report-marker__pulse');
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
        expect(el.innerHTML).toContain('<path'); // Teardrop silhouette
    });
});
