/**
 * The incident trend chart, rendered with the real recharts rather than a mock.
 *
 * The totals are drawn inside the bar layer, which recharts clips to the plot
 * rectangle, so "the label is not cut off" is a claim about geometry: the label's
 * baseline has to clear the clip rectangle's top edge by the height of the
 * digits above it. The container size a browser would measure is supplied here,
 * because jsdom does no layout, and everything below that — band positions, the
 * bar tops, the clip path — is recharts' own output.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('../hooks/useReachData', () => ({
    default: () => ({ reach: { reports: [], zones: [] } }),
}));

vi.mock('../components/map/MapView', () => ({
    default: () => <div data-testid="analytics-map" />,
}));

import DashboardAnalyticsWorkspace from '../components/dashboard/DashboardAnalyticsWorkspace';

// The plot's own h-52 is 208px; the trend panel spans three of five columns in a
// max-w-6xl section, which is what a laptop gives it.
const PANEL_WIDTH = 660;
const PLOT_HEIGHT = 208;
// A phone, for the crowd test: 360px of viewport leaves the panel about 320px.
const NARROW_PANEL_WIDTH = 320;
// A 10px bold digit is about 7px wide and its cap height about 8px.
const DIGIT_ASCENT_PX = 8;

class ResizeObserverStub {
    constructor(callback) {
        this.callback = callback;
    }

    // Browsers deliver one entry as soon as an element is observed, which is how
    // recharts reports the first measured size; jsdom has no ResizeObserver at
    // all, and without one recharts never measures the container.
    observe(target) {
        const { width, height } = target.getBoundingClientRect();
        this.callback([{ target, contentRect: { width, height } }], this);
    }

    unobserve() {}

    disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub;

const sizeContainer = (width, height = PLOT_HEIGHT) => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0,
        toJSON: () => ({ width, height }),
    });
};

afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
});

const report = {
    _id: 'report-1',
    address: 'E. Aguinaldo Street, Cajidiocan',
    municipalityName: 'Cajidiocan',
    barangay: 'Poblacion',
    incidentType: 'vehicular_accident',
    status: 'verified',
    createdAt: '2026-09-01T10:00:00',
    updatedAt: '2026-09-01T10:00:00',
};

const trendOf = (buckets) => buckets.map((bucket, index) => ({
    date: `Sep ${index + 1}`,
    fullDate: `Sep ${index + 1}, 2026`,
    dayKey: `2026-09-${String(index + 1).padStart(2, '0')}`,
    minor: 0,
    moderate: 0,
    severe: 0,
    critical: 0,
    unknown: 0,
    ...bucket,
    total: bucket.total ?? 0,
}));

const renderTrend = (chartData, { width = PANEL_WIDTH } = {}) => {
    sizeContainer(width);
    render(
        <DashboardAnalyticsWorkspace
            user={{ role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' }}
            hasMunicipality
            selectedMonth={new Date(2026, 8, 1)}
            setSelectedMonth={vi.fn()}
            stats={{ totalReports: 1 }}
            reports={[report]}
            allReports={[report]}
            highRiskZones={[]}
            performanceMetrics={{ pendingCount: 0, dispatchReadyCount: 1, respondingCount: 0, resolvedCount: 0 }}
            chartData={chartData}
            dashboardReports={[report]}
            focusLocation={null}
            historySectionRef={{ current: null }}
            loading={false}
            error=""
            onOpenMap={vi.fn()}
            onOpenReports={vi.fn()}
        />
    );
};

const clipRect = () => {
    const rect = document.querySelector('clipPath rect');
    return rect ? { top: Number(rect.getAttribute('y')) } : null;
};

const totalLabels = () => [...document.querySelectorAll('.recharts-label-list text')]
    .map((node) => ({ text: node.textContent, y: Number(node.getAttribute('y')) }));

// The count axis is the left-hand axis, and recharts right-anchors its tick
// labels while the x axis centres its own.
// The top of the tallest bar, which is where the axis maximum shows itself: the
// lower the bar, the more headroom the axis kept above it.
const tallestBarTop = () => Math.min(...[...document.querySelectorAll('.recharts-bar-rectangle .recharts-rectangle')]
    .map((node) => Number(node.getAttribute('y'))));

describe('incident trend chart geometry', () => {
    // 4, 8, 12 and 100 are the peaks recharts' own nice ticks landed exactly on,
    // which is what left the tallest bar's total outside the plot.
    for (const peak of [1, 4, 8, 10, 12, 31, 100, 137]) {
        test(`keeps a ${peak}-report bucket total inside the plot`, () => {
            renderTrend(trendOf([{ total: peak, minor: peak }, { total: 0 }]));

            const clip = clipRect();
            const labels = totalLabels();

            expect(clip).not.toBeNull();
            expect(labels).toHaveLength(1);
            expect(labels[0].text).toBe(String(peak));
            // The label sits 4px above the bar top; its digits rise ~8px more, so
            // anything above the clip rectangle's top edge is cut away.
            expect(labels[0].y - DIGIT_ASCENT_PX).toBeGreaterThanOrEqual(clip.top);
            // The axis maximum, read off the bar itself: the tallest bar stops at
            // least a label below the top of the plot.
            expect(tallestBarTop() - clip.top).toBeGreaterThanOrEqual(12);
        });
    }

    test('labels every active bucket and keeps its exact count in the description', () => {
        renderTrend(trendOf([
            { total: 4, minor: 4 },
            { total: 0 },
            { total: 10, minor: 3, critical: 7 },
        ]));

        const clip = clipRect();

        expect(totalLabels().map((label) => label.text).sort()).toEqual(['10', '4']);
        for (const label of totalLabels()) {
            expect(label.y - DIGIT_ASCENT_PX).toBeGreaterThanOrEqual(clip.top);
        }

        const description = document.getElementById(
            screen.getByRole('img', { name: 'Daily incident report trend for September 2026' })
                .getAttribute('aria-describedby')
        );
        expect(description.textContent).toContain('Sep 1, 2026: 4');
        expect(description.textContent).toContain('Sep 3, 2026: 10');
    });

    test('drops crowded totals but keeps every count available off the plot', () => {
        // Twelve reports a day for a month: 2-digit totals on a phone-width panel
        // are about 9px of slot each, which is not enough for the digits.
        const busyMonth = trendOf(Array.from({ length: 31 }, () => ({ total: 12, critical: 12 })));
        renderTrend(busyMonth, { width: NARROW_PANEL_WIDTH });

        expect(totalLabels()).toEqual([]);

        const descriptorId = screen
            .getByRole('img', { name: 'Daily incident report trend for September 2026' })
            .getAttribute('aria-describedby');
        const description = document.getElementById(descriptorId).textContent;

        expect(description).toContain('Sep 1, 2026: 12');
        // Every one of the month's totals, not just the peak.
        expect(description.match(/Sep \d+, 2026: 12/g)).toHaveLength(31);
        expect(description).toContain('peak Sep 1, 2026 (12)');
    });

    test('scales a high-count bucket without closing the gap above its bar', () => {
        renderTrend(trendOf([{ total: 137, critical: 137 }, { total: 0 }]));

        const clip = clipRect();
        const labels = totalLabels();

        expect(labels.map((label) => label.text)).toEqual(['137']);
        expect(labels[0].y - DIGIT_ASCENT_PX).toBeGreaterThanOrEqual(clip.top);
        // A 137-report day against a 150 maximum: the bar stops 13px below the
        // top of the plot, so the three digits still have somewhere to sit.
        expect(tallestBarTop() - clip.top).toBeGreaterThanOrEqual(12);
    });

    test('keeps the bars proportional to the counts rather than to a cap', () => {
        renderTrend(trendOf([{ total: 5, minor: 5 }, { total: 10, minor: 10 }]));

        const heights = [...document.querySelectorAll('.recharts-bar-rectangle .recharts-rectangle')]
            .map((node) => Number(node.getAttribute('height')));

        // The 10-report day is twice the 5-report day against the same axis.
        expect(heights).toHaveLength(2);
        expect(heights[1] / heights[0]).toBeCloseTo(2, 5);
    });
});
