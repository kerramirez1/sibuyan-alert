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
 * White center dot for the teardrop pin head — same for all statuses.
 */
export const getStatusIconInnerSvg = () => `<circle cx="12" cy="10.5" r="3" fill="white"/>`;

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
    width = 20,
    height = 28,
} = {}) => {
    const palette = STATUS_PIN_PALETTES[status]
        || (color ? { base: color, dark: color } : STATUS_PIN_PALETTES.default);
    const base = color || palette.base;
    const dark = palette.dark || base;
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
export const getOperationalMarkerSvg = (status, color, { width = 20, height = 28 } = {}) => {
    const effectiveColor = color || MAP_STATUS_CONFIG[status]?.markerColor || MAP_STATUS_CONFIG.verified.markerColor;
    return getMapPinSvg({ status, color: effectiveColor, width, height });
};

/**
 * High-risk hazard zone marker SVG — same pin shape, risk-red.
 */
export const getRiskZoneMarkerSvg = (color = MAP_RISK_ZONE_CONFIG.markerColor, { width = 20, height = 28 } = {}) => (
    getMapPinSvg({ status: 'risk', color, width, height })
);

/**
 * Draggable selected-location marker SVG.
 */
export const getSelectedLocationMarkerSvg = ({ width = 20, height = 28 } = {}) => (
    getMapPinSvg({ status: 'selected', color: '#EF4444', width, height })
);

/**
 * Creates the HTML container element for incident report markers on the map.
 */
export const createOperationalMarkerElement = ({
    report,
    groupedReports = [],
    markerColor,
}) => {
    const el = document.createElement('div');
    el.className = 'report-marker';
    el.style.cursor = 'pointer';
    el.style.zIndex = report?.status === 'pending' ? '2' : '1';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute(
        'aria-label',
        groupedReports.length > 1
            ? `${groupedReports.length} incidents at this location`
            : `${report?.title || report?.incidentType || 'Incident'} map marker`
    );

    const isResponding = report?.status === 'responding';
    const markerSvg = getOperationalMarkerSvg(report?.status, markerColor);

    el.innerHTML = `
        <div style="position:relative;width:24px;height:30px;display:flex;align-items:flex-end;justify-content:center;">
            ${isResponding ? '<span class="report-marker__pulse" aria-hidden="true"></span>' : ''}
            ${markerSvg}
            ${groupedReports.length > 1 ? `
                <span style="
                    position:absolute;
                    right:-5px;
                    top:-4px;
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
 * Creates the HTML container element for high-risk hazard zones.
 */
export const createRiskZoneMarkerElement = ({ zone, color }) => {
    const el = document.createElement('div');
    el.className = 'zone-marker';
    el.style.cursor = 'pointer';
    el.style.zIndex = '1';
    el.title = zone?.name || 'High-risk zone';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', `${zone?.name || 'Risk zone'} map marker`);

    const markerSvg = getRiskZoneMarkerSvg(color);

    el.innerHTML = `
        <div style="position:relative;width:24px;height:30px;display:flex;align-items:flex-end;justify-content:center;">
            ${markerSvg}
        </div>
    `;

    return el;
};
