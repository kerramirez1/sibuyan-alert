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
 * The one size every incident marker renders at, on every map.
 *
 * There are six surfaces that mount `MapView` (the dashboard, the analytics
 * workspace, the admin zone page, and three location previews), and each used to
 * reach the pin builder through its own default argument. Declaring the size once
 * here and passing it explicitly from `getOperationalMarkerSvg` means a preview
 * map, a detail map and the dashboard physically cannot drift apart — shrinking
 * the marker is a one-line change that lands everywhere at once.
 *
 * The marker body in `index.css` reads the same numbers through the
 * `--marker-w` / `--marker-h` custom properties the builder writes, so the
 * grouped-count badge scales with it instead of being hand-tuned twice.
 *
 * `RESPONDING_DOT_SIZE` below is derived from these numbers rather than picked
 * separately: the dot has no tip, but it still has to look like the same class
 * of mark as the pins standing next to it.
 */
export const INCIDENT_MARKER_SIZE = Object.freeze({ width: 12, height: 17 });

/**
 * Geometry for the responding dot, derived from the incident pin it sits among.
 *
 * The pin is drawn in a 24x32 viewBox at 12x17px, so its head — the circle the
 * eye actually reads as "the marker" — is 9px across (r≈9 in the viewBox, scaled
 * by 12/24). The dot's solid core is exactly that 9px, so a responding incident
 * carries the same weight as its neighbours instead of standing out by size,
 * which is the opposite of what a status marker should do.
 *
 * The pulse's outermost ring is 14px: 2px past the pin's 12px width and well
 * inside its 17px height, so the whole animated mark stays in the envelope the
 * neighbouring pins occupy. An earlier 22px footprint made the dot the widest
 * thing on the map at almost twice the pin's width — motion is supposed to make
 * a marker noticed, not bigger.
 *
 * These live next to `INCIDENT_MARKER_SIZE` because *this* is the relationship
 * that has to hold. How the ring travels between these two diameters — easing,
 * fade, timing — is a motion concern and stays with the pulse kit in CSS.
 */
export const RESPONDING_DOT_SIZE = Object.freeze({ footprint: 14, core: 9 });

/**
 * The same dot at legend scale, where the pin symbols are 8px circles rather
 * than 12x17px map markers. Shares the core's size with those symbols for the
 * same reason the map version shares its core with the pin head: in a legend row
 * the solid mark is what the eye compares, and it has to match.
 */
export const RESPONDING_DOT_LEGEND_SIZE = Object.freeze({ footprint: 12, core: 8 });

/**
 * Draggable placement pin for the report flow. Deliberately larger than an
 * incident marker: it is a target the user grabs and drags, not a map label.
 * Recorded here at its existing size so the number lives in one place — this
 * change is not meant to resize it.
 */
export const SELECTED_MARKER_SIZE = Object.freeze({ width: 30, height: 34 });

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
    width = INCIDENT_MARKER_SIZE.width,
    height = INCIDENT_MARKER_SIZE.height,
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
export const getOperationalMarkerSvg = (status, color, {
    width = INCIDENT_MARKER_SIZE.width,
    height = INCIDENT_MARKER_SIZE.height,
} = {}) => {
    const effectiveColor = color || MAP_STATUS_CONFIG[status]?.markerColor || MAP_STATUS_CONFIG.verified.markerColor;
    return getMapPinSvg({ status, color: effectiveColor, width, height });
};

/**
 * High-risk hazard zone marker SVG — same pin shape, risk-red.
 *
 * Retained for non-map surfaces that need a static zone glyph. The live map
 * marker does NOT use this: `createRiskZoneMarkerElement` renders the animated
 * pure-red radar from the shared pulse kit instead (see below).
 */
export const getRiskZoneMarkerSvg = (color = MAP_RISK_ZONE_CONFIG.markerColor, {
    width = INCIDENT_MARKER_SIZE.width,
    height = INCIDENT_MARKER_SIZE.height,
} = {}) => (
    getMapPinSvg({ status: 'risk', color, width, height })
);

/**
 * Draggable selected-location marker SVG.
 */
export const getSelectedLocationMarkerSvg = ({
    width = SELECTED_MARKER_SIZE.width,
    height = SELECTED_MARKER_SIZE.height,
} = {}) => (
    getMapPinSvg({ status: 'selected', color: '#EF4444', width, height })
);

/**
 * Waves drawn behind the responding dot.
 *
 * Two, not the hazard radar's three. Three exhausts the full `--marker-wave`
 * train, so a ring is always leaving; two still means a ring leaves every
 * `--marker-beat`, while only two waves are ever in flight. Fewer, thinner
 * marks is the whole difference between this and the halo that was removed for
 * being louder than the incident it described.
 */
const RESPONDING_PULSE_WAVES = 2;

/**
 * Writes the pulse kit's geometry as custom properties.
 *
 * Sizes are passed in rather than defaulted in CSS so that a caller cannot ship
 * a dot at a size nobody measured: the builder that knows which pin the dot
 * stands next to is the same one that decides how big the dot is.
 */
const pulseSizeStyle = ({ size, core }) => `--pulse-size:${size}px;--pulse-core:${core}px;`;

/**
 * Builds the shared pulse kit's markup: N waves behind one static core dot.
 *
 * Colour and geometry both arrive as custom properties, so the two consumers
 * cannot drift apart on how big a wave is or what colour it is — the caller
 * knows which blue or red it already computed, and how wide the mark next to it
 * is. The motion tokens (travel, easing, fade) stay in `index.css`.
 */
const buildPulseMarkup = ({ color, waves, filled = false, size, core }) => `
        <div class="pulse-marker${filled ? ' pulse-marker--filled' : ''}" style="--pulse-color:${color};${size ? pulseSizeStyle({ size, core }) : ''}" aria-hidden="true">
            ${Array.from({ length: waves }, () => '<span class="pulse-marker__wave"></span>').join('')}
            <span class="pulse-marker__core"></span>
        </div>
    `.trim();

/**
 * Creates the HTML container element for incident report markers on the map.
 *
 * @param {object} [options]
 * @param {object} [options.report]           Representative record for this spot.
 * @param {object[]} [options.groupedReports] Every record sharing the coordinates.
 * @param {string} [options.markerColor]      Colour the caller already resolved.
 * @param {boolean} [options.respondingDot]   Render a responding incident as a
 *   dot instead of a teardrop pin. The reporter/guest map passes `true`, because
 *   there verified, transferred and responding all share one blue and shape plus
 *   motion are the only things left to tell them apart. Operational maps pass
 *   `false`: a dispatcher reads status by colour, and a second marker shape would
 *   just be one more thing to learn on a triage screen.
 * The dot's pulse is CSS-only and has no switch here. `prefers-reduced-motion`
 * in `index.css` is the single owner of that decision (see the note above
 * `.sibuyan-map-credit` for why a JS-side gate was removed), so this builder
 * cannot ship one device a pulsing marker and the next a frozen one while the
 * hazard radar beside it keeps sweeping.
 */
export const createOperationalMarkerElement = ({
    report,
    groupedReports = [],
    markerColor,
    respondingDot = false,
}) => {
    const isRespondingDot = respondingDot && report?.status === 'responding';
    const el = document.createElement('div');
    el.className = [
        'report-marker',
        isRespondingDot ? 'report-marker--responding' : '',
    ].filter(Boolean).join(' ');
    el.style.cursor = 'pointer';
    el.style.zIndex = report?.status === 'pending' ? '2' : '1';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');

    const isGroup = groupedReports.length > 1;
    const groupHasPending = isGroup && groupedReports.some((item) => item?.status === 'pending');
    const respondingCount = isRespondingDot
        ? groupedReports.filter((item) => item?.status === 'responding').length
        : 0;
    const baseLabel = isGroup
        ? `${groupedReports.length} incidents at this location`
        : `${report?.title || report?.incidentType || 'Incident'} map marker`;
    // Facts a sighted reader gets for free and a screen reader does not: the
    // marker's colour says unverified, and its shape says somebody is already
    // handling it. Motion is not something a screen reader can observe either,
    // so the state the pulse announces visually is named here as well — and
    // anything that applies is named, so one fact can never hide the other.
    const qualifiers = [
        groupHasPending ? 'unverified' : null,
        isRespondingDot ? `${respondingCount === 1 ? 'one' : respondingCount} being responded to` : null,
    ].filter(Boolean);
    const markerLabel = report?.status === 'pending'
        // A lone unverified marker says so in two words rather than making the
        // reader parse a list with one item in it.
        ? 'Unverified report'
        : isGroup
            ? (qualifiers.length > 0 ? `${baseLabel}, including ${qualifiers.join(' and ')}` : baseLabel)
            : isRespondingDot
                ? `${baseLabel}, being responded to`
                : baseLabel;
    el.setAttribute('aria-label', markerLabel);
    // Non-color cues: the screen-reader label always carries them, and the hover
    // tooltip only appears on markers that actually have something extra to say.
    if (markerLabel !== baseLabel) {
        el.setAttribute('title', markerLabel);
    }

    // The pin body takes its size from these two custom properties, so the
    // grouped-count badge in index.css scales with the marker instead of being
    // hand-tuned a second time. The dot version needs neither: its size comes
    // from the pulse kit's own tokens.
    const bodyStyle = isRespondingDot
        ? ''
        : ` style="--marker-w:${INCIDENT_MARKER_SIZE.width}px;--marker-h:${INCIDENT_MARKER_SIZE.height}px;"`;
    const bodyClass = isRespondingDot
        ? 'report-marker__body report-marker__body--responding'
        : 'report-marker__body';

    el.innerHTML = `
        <div class="${bodyClass}"${bodyStyle}>
            ${isRespondingDot
                ? buildPulseMarkup({
                    color: markerColor,
                    waves: RESPONDING_PULSE_WAVES,
                    size: RESPONDING_DOT_SIZE.footprint,
                    core: RESPONDING_DOT_SIZE.core,
                })
                : getOperationalMarkerSvg(report?.status, markerColor)}
            ${groupedReports.length > 1 ? `<span class="report-marker__count">${groupedReports.length}</span>` : ''}
        </div>
    `;

    return el;
};

/**
 * Radar waves drawn behind the core dot.
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
 * Renders the filled variant of the shared pulse kit (see `index.css`): three
 * pure-red discs expanding outward from a solid, static core dot. Strictly
 * monochromatic red — no white border, ring, stroke, or halo anywhere, so the
 * hazard pin stays unmistakable against both the operational status pins (which
 * own the blue / amber / violet / cyan / green palette) and the map imagery.
 *
 * The dot never moves. It is the marker's anchor, so a moving centre reads as
 * the pin drifting off the coordinate it is meant to mark; the rings carry all
 * of the motion instead. Neither the rate nor the ring count is set here —
 * `--marker-beat` in `index.css` is the single source of truth for the beat and
 * `--marker-wave` (three beats) is one full sweep. The responding incident dot
 * reads the same beat and the same keyframes through the same kit, which is what
 * stops the alert and the status from out-shouting each other. Only
 * `transform: scale()` and `opacity` animate, so the effect is composited on the
 * GPU and cannot stutter the map while panning or zooming.
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

    // No inline animation-delay: the stagger is per-wave CSS in the pulse kit.
    const waves = Array.from(
        { length: RISK_ZONE_RADAR_RINGS },
        () => '<span class="pulse-marker__wave"></span>',
    ).join('');

    el.innerHTML = `
        <div class="pulse-marker pulse-marker--filled" style="--pulse-color:${coreColor};">
            ${waves}
            <span class="pulse-marker__core"></span>
        </div>
    `;

    return el;
};
