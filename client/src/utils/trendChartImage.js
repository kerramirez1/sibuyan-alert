/**
 * Export-only incident trend chart renderer.
 *
 * The dashboard trend chart is recharts SVG styled with document CSS
 * variables (var(--chart-grid), var(--chart-axis)), which cannot resolve
 * when an SVG is rasterized off-document — and dark mode would bake the
 * wrong palette. So the export never scrapes the live DOM: this module
 * builds a dedicated, fixed-palette SVG string and rasterizes it to PNG.
 *
 * The module is DOM-free at import time (only the raster step touches a
 * temporary Image/canvas) and needs no npm dependency beyond the DOM.
 */

// Severity fills mirror the dashboard's SEVERITY_SERIES hex values exactly.
const SEVERITY_FILLS = Object.freeze([
    { key: 'minor', fill: '#818CF8' },
    { key: 'moderate', fill: '#F59E0B' },
    { key: 'severe', fill: '#EA580C' },
    { key: 'critical', fill: '#DC2626' },
    { key: 'unknown', fill: '#94A3B8' },
]);

const BACKGROUND = '#FFFFFF';
const GRID_COLOR = '#E5E7EB';
const AXIS_TEXT = '#374151';
const FONT_STACK = 'Arial, Helvetica, sans-serif';
const EMPTY_MESSAGE = 'No incidents in this period';

const escapeXml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const round1 = (value) => Math.round(value * 10) / 10;

const niceCeil = (value) => {
    if (value <= 0) return 1;
    if (value <= 5) return Math.ceil(value);
    const power = 10 ** Math.floor(Math.log10(value));
    const scaled = value / power;
    const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
    return nice * power;
};

/**
 * Bucket label mirroring the dashboard X-axis logic: monthly day buckets
 * ('Sep 5', '2026-09-05') collapse to the day number the way formatXAxisDay
 * does; month/year buckets keep their short label. Falls back to
 * dayKey/fullDate when date is missing.
 */
export const formatTrendBucketLabel = (bucket) => {
    const raw = bucket?.date ?? bucket?.dayKey ?? bucket?.fullDate ?? '';
    if (raw === null || raw === undefined) return '';
    if (typeof raw === 'number') return String(raw);
    const str = String(raw).trim();
    if (!str) return '';
    if (/^[A-Za-z]{3} \d{1,2}$/.test(str) || /^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const match = str.match(/\d+$/);
        return match ? match[0] : str;
    }
    return str;
};

/**
 * Pure SVG string for the stacked incident trend chart. Fixed light palette
 * (never CSS variables, never dark mode) so rasterization is exact. Empty
 * data renders axes/gridlines with a centered message — never blank, never
 * throws.
 */
export const buildTrendChartSvg = (chartData, { width = 1280, height = 600 } = {}) => {
    const buckets = Array.isArray(chartData) ? chartData.filter(Boolean) : [];
    const margin = { top: 24, right: 24, bottom: 56, left: 56 };
    const plotWidth = Math.max(1, width - margin.left - margin.right);
    const plotHeight = Math.max(1, height - margin.top - margin.bottom);
    const plotBottom = margin.top + plotHeight;

    const hasData = buckets.some((bucket) => Number(bucket?.total) > 0);
    const maxTotal = buckets.reduce((max, bucket) => Math.max(max, Number(bucket?.total) || 0), 0);
    const yMax = hasData ? niceCeil(maxTotal) : 5;
    const tickStep = Math.max(1, Math.round(yMax / 5));
    const ticks = [];
    for (let value = 0; value <= yMax + 1e-9; value += tickStep) ticks.push(value);

    const yOf = (value) => margin.top + plotHeight - (value / yMax) * plotHeight;

    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
    parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${BACKGROUND}"/>`);

    // Horizontal gridlines + y-axis labels.
    for (const tick of ticks) {
        const y = round1(yOf(tick));
        parts.push(`<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotWidth}" y2="${y}" stroke="${GRID_COLOR}" stroke-width="1"/>`);
        parts.push(`<text x="${margin.left - 10}" y="${y}" text-anchor="end" dominant-baseline="middle" font-family="${FONT_STACK}" font-size="11" fill="${AXIS_TEXT}">${tick}</text>`);
    }
    // Baseline.
    parts.push(`<line x1="${margin.left}" y1="${round1(plotBottom)}" x2="${margin.left + plotWidth}" y2="${round1(plotBottom)}" stroke="${GRID_COLOR}" stroke-width="1"/>`);

    // Stacked bars.
    const count = buckets.length;
    if (count > 0) {
        const slotWidth = plotWidth / count;
        const barWidth = Math.max(2, Math.min(56, slotWidth * 0.62));
        const truncateLabels = count > 40;
        buckets.forEach((bucket, index) => {
            const centerX = margin.left + slotWidth * (index + 0.5);
            const x = round1(centerX - barWidth / 2);
            let y = plotBottom;
            for (const { key, fill } of SEVERITY_FILLS) {
                const value = Number(bucket?.[key]) || 0;
                if (value <= 0) continue;
                const barHeight = (value / yMax) * plotHeight;
                const barY = round1(y - barHeight);
                parts.push(`<rect x="${x}" y="${barY}" width="${round1(barWidth)}" height="${round1(Math.max(0.5, barHeight))}" fill="${fill}"/>`);
                y -= barHeight;
            }
            let label = formatTrendBucketLabel(bucket);
            if (truncateLabels && label.length > 8) label = `${label.slice(0, 7)}…`;
            parts.push(`<text x="${round1(centerX)}" y="${plotBottom + 22}" text-anchor="middle" font-family="${FONT_STACK}" font-size="11" fill="${AXIS_TEXT}">${escapeXml(label)}</text>`);
        });
    }

    // Empty state: axes stay, message centers the plot.
    if (!hasData) {
        parts.push(`<text x="${round1(margin.left + plotWidth / 2)}" y="${round1(margin.top + plotHeight / 2)}" text-anchor="middle" dominant-baseline="middle" font-family="${FONT_STACK}" font-size="14" fill="${AXIS_TEXT}">${EMPTY_MESSAGE}</text>`);
    }

    parts.push('</svg>');
    return parts.join('');
};

const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Trend chart image failed to load'));
    img.src = src;
});

/**
 * Renders the export trend chart to a PNG data URL string.
 * Pure up to the raster step; touches the DOM only for a temporary
 * Image/canvas pair. Never throws on empty data (renders the empty state);
 * raster failures reject and are handled fail-soft by the caller.
 */
export const renderTrendChartPng = async (chartData, { width = 1280, height = 600 } = {}) => {
    const svg = buildTrendChartSvg(chartData, { width, height });
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    try {
        const img = await loadImage(objectUrl);
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context unavailable');
        ctx.fillStyle = BACKGROUND;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
};
