import { MAP_STATUS_CONFIG, MAP_RISK_ZONE_CONFIG } from '../config/mapVisuals';

/**
 * Status color palettes — matte base with a slightly darker lower tone for depth.
 */
export const STATUS_PIN_PALETTES = Object.freeze({
    pending: Object.freeze({ base: '#F59E0B', dark: '#D97706' }),
    verified: Object.freeze({ base: '#2563EB', dark: '#1D4ED8' }),
    transferred: Object.freeze({ base: '#7C3AED', dark: '#6D28D9' }),
    responding: Object.freeze({ base: '#0891B2', dark: '#0E7490' }),
    resolved: Object.freeze({ base: '#16A34A', dark: '#15803D' }),
    rejected: Object.freeze({ base: '#64748B', dark: '#475569' }),
    risk: Object.freeze({ base: '#DC2626', dark: '#B91C1C' }),
    selected: Object.freeze({ base: '#EF4444', dark: '#DC2626' }),
    default: Object.freeze({ base: '#6B7280', dark: '#4B5563' }),
});

/**
 * Darkens (negative percent) or lightens a #rrggbb hex toward black/white.
 * Used to derive the pin gradient's lower tone from an explicit override
 * color so unified pins never mix hues (e.g. blue top + purple bottom).
 */
export const shadeHexColor = (hex, percent = -14) => {
    if (typeof hex !== 'string') return hex;
    const match = hex.trim().match(/^#([0-9a-f]{6})$/i);
    if (!match) return hex;
    const amount = Math.max(-100, Math.min(100, Number(percent) || 0)) / 100;
    const num = parseInt(match[1], 16);
    const target = amount < 0 ? 0 : 255;
    const blend = (channel) => Math.round(channel + (target - channel) * Math.abs(amount));
    const r = blend((num >> 16) & 255);
    const g = blend((num >> 8) & 255);
    const b = blend(num & 255);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
};

/**
 * Center glyph for the teardrop pin head — white dot for incidents,
 * white exclamation for hazard zones so the two never read the same.
 */
export const getStatusIconInnerSvg = (status) => {
    if (status === 'risk') {
        return '<rect x="11" y="5.5" width="2" height="6" rx="1" fill="white"/><circle cx="12" cy="13.8" r="1.4" fill="white"/>';
    }
    return '<circle cx="12" cy="10.5" r="3" fill="white"/>';
};

/**
 * Compact teardrop map-pin SVG marker.
 *
 * A single continuous teardrop silhouette — rounded head tapering to a pointed
 * lower tip — with a subtle top-to-bottom gradient for depth, a thin white
 * border, a small semi-transparent inner dot, and a soft drop-shadow.
 *
 * No exposed stem/stick, no inner icons, no candy/lollipop appearance.
 */
export const getMapPinSvg = ({
    status = 'default',
    color = null,
    width = 16,
    height = 22,
} = {}) => {
    const palette = STATUS_PIN_PALETTES[status]
        || (color ? { base: color, dark: color } : STATUS_PIN_PALETTES.default);
    const base = color || palette.base;
    // Explicit override colors derive their own lower tone so unified pins
    // never mix hues (blue base must not fall back to a purple palette dark).
    const dark = color ? shadeHexColor(color) : (palette.dark || base);
    const safeId = (status || 'pin').replace(/[^a-z0-9]/gi, '') + (base || '').replace(/[^a-z0-9]/gi, '');
    const gradId = `mp-${safeId}`;
    const icon = getStatusIconInnerSvg(status);

    // Teardrop pin in a 24×32 viewBox:
    //   Rounded head centered at (12, 10.5) with r≈9
    //   Smooth cubic curves narrow to a pointed tip at (12, 30)
    return `
        <svg width="${width}" height="${height}" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 1px 2.5px rgba(0,0,0,0.3));">
            <defs>
                <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${base}"/>
                    <stop offset="100%" stop-color="${dark}"/>
                </linearGradient>
            </defs>
            <path d="M12 1.5 C6.2 1.5 1.5 6.2 1.5 12 C1.5 17.8 7 23.5 12 30 C17 23.5 22.5 17.8 22.5 12 C22.5 6.2 17.8 1.5 12 1.5 Z" fill="url(#${gradId})"/>
            ${icon}
        </svg>
    `.trim();
};

/**
 * Standard operational incident marker SVG.
 */
export const getOperationalMarkerSvg = (status, color, { width = 16, height = 22 } = {}) => {
    const effectiveColor = color || MAP_STATUS_CONFIG[status]?.markerColor || MAP_STATUS_CONFIG.verified.markerColor;
    return getMapPinSvg({ status, color: effectiveColor, width, height });
};

/**
 * High-risk hazard zone marker SVG — same pin shape, risk-red.
 *
 * Retained for non-map surfaces that need a static zone glyph. The live map
 * marker does NOT use this: `createRiskZoneMarkerElement` renders the animated
 * pure-red radar instead (see below).
 */
export const getRiskZoneMarkerSvg = (color = MAP_RISK_ZONE_CONFIG.markerColor, { width = 16, height = 22 } = {}) => (
    getMapPinSvg({ status: 'risk', color, width, height })
);

/**
 * Draggable selected-location marker SVG.
 */
export const getSelectedLocationMarkerSvg = ({ width = 16, height = 22 } = {}) => (
    getMapPinSvg({ status: 'selected', color: '#EF4444', width, height })
);

/**
 * Halo rings drawn behind a responding pin.
 *
 * Three, not one: a single ring can only blink, while three staggered a beat
 * apart give the eye a sequence — a wave leaves the pin every 0.5s while the
 * other two are still mid-flight. The stagger itself lives in CSS (`nth-child`
 * delays in index.css) so the timing stays next to the animation it belongs to.
 */
const RESPONDING_HALO_RINGS = 3;

/**
 * Creates the HTML container element for incident report markers on the map.
 */
export const createOperationalMarkerElement = ({
    report,
    groupedReports = [],
    markerColor,
}) => {
    const el = document.createElement('div');
    el.className = `report-marker${report?.status === 'responding' ? ' report-marker--responding' : ''}`;
    el.style.cursor = 'pointer';
    el.style.zIndex = report?.status === 'pending' ? '2' : '1';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    const markerStatusLabel = report?.status === 'pending'
        ? 'Unverified report'
        : groupedReports.length > 1 && groupedReports.some((item) => item?.status === 'pending')
            ? `${groupedReports.length} incidents at this location, including unverified`
            : null;
    const fallbackLabel = groupedReports.length > 1
        ? `${groupedReports.length} incidents at this location`
        : `${report?.title || report?.incidentType || 'Incident'} map marker`;
    el.setAttribute('aria-label', markerStatusLabel ?? fallbackLabel);
    // Non-color unverified cue: screen-reader label always carries it, and the
    // hover tooltip only appears on pins that actually need the warning.
    if (markerStatusLabel) {
        el.setAttribute('title', markerStatusLabel);
    }

    const isResponding = report?.status === 'responding';
    const markerSvg = getOperationalMarkerSvg(report?.status, markerColor);

    // The beat lives BEHIND the responding pin, never on it. A map pin is a
    // fixed reference point, and scaling a teardrop from its tip reads as the
    // pin inflating rather than as activity. A halo has no silhouette to
    // distort, so the motion reads as energy instead.
    const halos = isResponding
        ? Array.from(
            { length: RESPONDING_HALO_RINGS },
            () => '<span class="report-marker__halo" aria-hidden="true"></span>',
        ).join('')
        : '';

    el.innerHTML = `
        <div style="position:relative;width:20px;height:24px;display:flex;align-items:flex-end;justify-content:center;">
            ${halos}
            ${markerSvg}
            ${groupedReports.length > 1 ? `
                <span style="
                    position:absolute;
                    right:-6px;
                    top:-5px;
                    min-width:16px;
                    height:16px;
                    padding:0 3px;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    border-radius:9999px;
                    border:1.5px solid #ffffff;
                    background:#0f172a;
                    color:#ffffff;
                    font:700 9px/1 Inter,system-ui,sans-serif;
                    box-shadow:0 1px 3px rgba(0,0,0,0.3);
                    letter-spacing:-0.02em;
                    z-index:3;
                ">${groupedReports.length}</span>
            ` : ''}
        </div>
    `;

    return el;
};

/**
 * Radar rings drawn behind the core dot.
 *
 * Three, not one: a single ring can only blink, while three staggered a beat
 * apart give the marker a continuous radar sweep — a ring leaves the pin every
 * beat while the other two are still travelling. The stagger itself lives in
 * CSS (`nth-child` delays in index.css) so the timing sits next to the
 * animation it belongs to.
 */
const RISK_ZONE_RADAR_RINGS = 3;

/**
 * Creates the HTML container element for high-risk hazard zones.
 *
 * Renders a radar / ripple pulse: pure-red rings expanding outward from a solid,
 * static core dot. Strictly monochromatic red — no white border, ring, stroke,
 * or halo anywhere, so the hazard pin stays unmistakable against both the
 * operational status pins (which own the blue / amber / violet / cyan / green
 * palette) and the map imagery.
 *
 * The dot never moves. It is the marker's anchor, so a moving centre reads as
 * the pin drifting off the coordinate it is meant to mark; the rings carry all
 * of the motion instead. Neither the rate nor the ring count is set here —
 * `--marker-beat` in `index.css` is the single source of truth for the beat and
 * `--marker-wave` (three beats) is one full sweep, which the responding
 * incident pin reads as well. Only `transform: scale()` and `opacity` animate,
 * so the effect is composited on the GPU and cannot stutter the map while
 * panning or zooming.
 *
 * @param {object} [options]
 * @param {object} [options.zone]  Zone record — only `name` reaches the DOM.
 * @param {string} [options.color] Pure-red override; defaults to the zone red.
 */
export const createRiskZoneMarkerElement = ({ zone, color } = {}) => {
    const el = document.createElement('div');
    el.className = 'zone-marker';
    el.style.cursor = 'pointer';
    el.style.zIndex = '1';
    el.title = zone?.name || 'High-risk zone';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', `${zone?.name || 'Risk zone'} map marker`);

    const coreColor = color || MAP_RISK_ZONE_CONFIG.markerColor;

    // No inline animation-delay: the stagger is per-ring CSS.
    const rings = Array.from(
        { length: RISK_ZONE_RADAR_RINGS },
        () => '<span class="zone-marker__ripple" aria-hidden="true"></span>',
    ).join('');

    el.innerHTML = `
        <div class="zone-marker__radar" style="--zone-radar-color:${coreColor};">
            ${rings}
            <span class="zone-marker__core" aria-hidden="true"></span>
        </div>
    `;

    return el;
};
