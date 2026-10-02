import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
    buildTrendChartSvg,
    formatTrendBucketLabel,
    renderTrendChartPng,
} from '../utils/trendChartImage';

const twoBuckets = [
    {
        date: 'Sep 1', fullDate: 'Sep 1, 2026', dayKey: '2026-09-01', total: 3,
        minor: 1, moderate: 1, severe: 0, critical: 1, unknown: 0,
    },
    {
        date: 'Sep 2', fullDate: 'Sep 2, 2026', dayKey: '2026-09-02', total: 0,
        minor: 0, moderate: 0, severe: 0, critical: 0, unknown: 0,
    },
];

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('trendChartImage', () => {
    test('formatTrendBucketLabel mirrors the dashboard axis logic', () => {
        expect(formatTrendBucketLabel({ date: 'Sep 5' })).toBe('5');
        expect(formatTrendBucketLabel({ date: 'Sep' })).toBe('Sep');
        expect(formatTrendBucketLabel({ date: '2026' })).toBe('2026');
        expect(formatTrendBucketLabel({ dayKey: '2026-09-05' })).toBe('05');
        expect(formatTrendBucketLabel({ fullDate: 'September 2026' })).toBe('September 2026');
        expect(formatTrendBucketLabel(null)).toBe('');
        expect(formatTrendBucketLabel({})).toBe('');
    });

    test('buildTrendChartSvg renders stacked bars with the dashboard severity fills', () => {
        const svg = buildTrendChartSvg(twoBuckets);

        expect(svg).toContain('<svg');
        // Exact dashboard SEVERITY_SERIES hex fills.
        expect(svg).toContain('#818CF8');
        expect(svg).toContain('#F59E0B');
        expect(svg).toContain('#DC2626');
        // Fixed light palette, never CSS variables.
        expect(svg).toContain('#FFFFFF');
        expect(svg).not.toContain('var(--');
        expect(svg).not.toContain('No incidents in this period');
    });

    test('buildTrendChartSvg renders the empty state instead of throwing or blanking', () => {
        for (const input of [[], null, undefined, [{ date: 'Sep 1', total: 0 }]]) {
            const svg = buildTrendChartSvg(input);
            expect(svg).toContain('<svg');
            expect(svg).toContain('No incidents in this period');
        }
    });

    describe('renderTrendChartPng', () => {
        const originalCreateObjectURL = URL.createObjectURL;
        const originalRevokeObjectURL = URL.revokeObjectURL;

        beforeEach(() => {
            // jsdom has no canvas rasterization; stub the DOM pieces so the
            // function's contract (PNG dataURL out, URL revoked) is testable.
            vi.stubGlobal('Image', class {
                set src(value) {
                    this._src = value;
                    queueMicrotask(() => {
                        if (typeof this.onload === 'function') this.onload();
                    });
                }
            });
            vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
                fillRect: vi.fn(),
                drawImage: vi.fn(),
                fillStyle: '',
            });
            vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(PNG_DATA_URL);
            URL.createObjectURL = vi.fn(() => 'blob:mock-trend-chart');
            URL.revokeObjectURL = vi.fn();
        });

        afterEach(() => {
            URL.createObjectURL = originalCreateObjectURL;
            URL.revokeObjectURL = originalRevokeObjectURL;
            vi.restoreAllMocks();
            vi.unstubAllGlobals();
        });

        test('returns a PNG dataURL for a two-bucket sample', async () => {
            const url = await renderTrendChartPng(twoBuckets);

            expect(url.startsWith('data:image/png')).toBe(true);
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-trend-chart');
        });

        test('returns a PNG dataURL for empty data (empty state, not a throw)', async () => {
            const url = await renderTrendChartPng([]);

            expect(url.startsWith('data:image/png')).toBe(true);
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-trend-chart');
        });
    });
});
