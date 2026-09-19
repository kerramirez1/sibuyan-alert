import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import MapLegend from '../components/map/MapLegend';
import { isRiskZoneLayerVisibleForFilter, MAP_RISK_ZONE_CONFIG, MAP_STATUS_CONFIG } from '../config/mapVisuals';

describe('MapLegend', () => {
    test('keeps danger and lifecycle colors semantically distinct', () => {
        const lifecycleColors = Object.values(MAP_STATUS_CONFIG).map(({ markerColor }) => markerColor);

        expect(new Set(lifecycleColors).size).toBe(lifecycleColors.length);
        expect(lifecycleColors).not.toContain(MAP_RISK_ZONE_CONFIG.markerColor);
        expect(MAP_STATUS_CONFIG.responding.markerColor).toBe('#0891B2');
        expect(MAP_STATUS_CONFIG.rejected.markerColor).toBe('#64748B');
    });

    test('shows a single unified active entry plus the responding dot on the public map', () => {
        render(<MapLegend />);

        expect(screen.queryByText('High-risk zone')).not.toBeInTheDocument();
        // Reporter/guest map collapses verified/transferred/responding into
        // one blue marker, and then draws the responding one as a different
        // shape, so the legend owes the reader an explanation of that shape.
        expect(screen.getByText('Active incident')).toBeInTheDocument();
        expect(screen.getByText('Being responded to')).toBeInTheDocument();
        expect(screen.queryByText('Verified')).not.toBeInTheDocument();
        expect(screen.queryByText('Transferred')).not.toBeInTheDocument();
        expect(screen.queryByText('Responding')).not.toBeInTheDocument();
        expect(screen.queryByText('Pending')).not.toBeInTheDocument();
    });

    test('draws the public responding entry as a pulsing dot, not another flat bullet', () => {
        const { container } = render(<MapLegend />);

        const entry = screen.getByText('Being responded to').closest('div');
        // The swatch is the real pulse kit at legend scale, so the legend cannot
        // promise an effect the map does not perform — and it inherits the
        // reduced-motion fallback instead of needing one of its own.
        const swatch = entry.querySelector('.pulse-marker');
        expect(swatch).not.toBeNull();
        expect(swatch.querySelector('.pulse-marker__core')).not.toBeNull();
        expect(swatch.querySelectorAll('.pulse-marker__wave')).toHaveLength(1);
        // The unified active pin keeps the plain bullet, so the two entries are
        // not telling the reader the same thing twice.
        const activeEntry = screen.getByText('Active incident').closest('div');
        expect(activeEntry.querySelector('.pulse-marker')).toBeNull();
        expect(container.querySelectorAll('.pulse-marker')).toHaveLength(1);
    });

    test('keeps the operational legend on the lifecycle name, drawn as the dot', () => {
        const { container } = render(<MapLegend filterMode="response" showPending />);

        // The marker is the dot on every rail now, so this legend shows the dot
        // too — but the name stays the one the tab and the card use: an operator
        // should not have to learn a second word for the state they dispatch.
        expect(screen.getByText('Active response')).toBeInTheDocument();
        expect(screen.queryByText('Being responded to')).not.toBeInTheDocument();
        expect(container.querySelectorAll('.pulse-marker')).toHaveLength(1);
    });

    test('isolates the pending filter and hides the hazard indicator', () => {
        render(<MapLegend showPending filterStatus="pending" hasGroupedReports />);

        expect(screen.getByText('Pending')).toBeInTheDocument();
        expect(screen.queryByText('High-risk zone')).not.toBeInTheDocument();
        expect(screen.queryByText('Verified')).not.toBeInTheDocument();
        expect(screen.queryByText('Transferred')).not.toBeInTheDocument();
        expect(screen.queryByText('Responding')).not.toBeInTheDocument();
        expect(screen.getByText('Multiple incidents')).toBeInTheDocument();
    });

    test('does not show pending status in public mode even if pending filter is given without showPending', () => {
        render(<MapLegend filterStatus="pending" filterMode="public" />);

        expect(screen.queryByText('Pending')).not.toBeInTheDocument();
        expect(screen.queryByText('High-risk zone')).not.toBeInTheDocument();
    });

    test('shows only verified status for the verified filter and hides the hazard indicator', () => {
        render(<MapLegend filterStatus="verified" />);

        expect(screen.getByText('Verified')).toBeInTheDocument();
        expect(screen.queryByText('High-risk zone')).not.toBeInTheDocument();
        expect(screen.queryByText('Pending')).not.toBeInTheDocument();
        expect(screen.queryByText('Transferred')).not.toBeInTheDocument();
        expect(screen.queryByText('Active response')).not.toBeInTheDocument();
    });

    test('shows only the responding status for the responding filter and hides the hazard indicator', () => {
        render(<MapLegend filterStatus="responding" filterMode="response" />);

        // 'Active response' is the one name for this lifecycle state across the
        // tab, the card, the status badge, and this legend entry — and the symbol
        // beside it is the pulsing dot the map now draws for it. The retired
        // 'Responding' label must not come back on one surface only.
        expect(screen.getByText('Active response')).toBeInTheDocument();
        expect(document.querySelector('.pulse-marker')).not.toBeNull();
        expect(screen.queryByText('Responding')).not.toBeInTheDocument();
        expect(screen.queryByText('High-risk zone')).not.toBeInTheDocument();
        expect(screen.queryByText('Pending')).not.toBeInTheDocument();
        expect(screen.queryByText('Transferred')).not.toBeInTheDocument();
        expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    });

    test('shows only transferred status for the transferred filter and hides the hazard indicator', () => {
        render(<MapLegend filterStatus="transferred" />);

        expect(screen.getByText('Transferred')).toBeInTheDocument();
        expect(screen.queryByText('High-risk zone')).not.toBeInTheDocument();
        expect(screen.queryByText('Pending')).not.toBeInTheDocument();
        expect(screen.queryByText('Verified')).not.toBeInTheDocument();
        expect(screen.queryByText('Active response')).not.toBeInTheDocument();
    });

    test('names both markers on the Ready to dispatch tab', () => {
        // The tab is the verified + transferred pair. Its legend has to list both,
        // because falling through to the generic branch would describe every
        // status the map can draw — pins that are not on screen for this tab.
        render(<MapLegend filterStatus="dispatch" />);

        expect(screen.getByText('Verified')).toBeInTheDocument();
        expect(screen.getByText('Transferred')).toBeInTheDocument();
        expect(screen.queryByText('Pending')).not.toBeInTheDocument();
        expect(screen.queryByText('Active response')).not.toBeInTheDocument();
    });

    test('exposes the hazard layer only for the risk-zones filter', () => {
        expect(isRiskZoneLayerVisibleForFilter(null)).toBe(false);
        expect(isRiskZoneLayerVisibleForFilter('all')).toBe(false);
        expect(isRiskZoneLayerVisibleForFilter('risk-zones')).toBe(true);
        expect(isRiskZoneLayerVisibleForFilter('incidents')).toBe(false);
        expect(isRiskZoneLayerVisibleForFilter('pending')).toBe(false);
        expect(isRiskZoneLayerVisibleForFilter('verified')).toBe(false);
        expect(isRiskZoneLayerVisibleForFilter('responding')).toBe(false);
        expect(isRiskZoneLayerVisibleForFilter('transferred')).toBe(false);
        expect(isRiskZoneLayerVisibleForFilter('resolved')).toBe(false);
    });

    test('hides the hazard indicator for the incidents-only filter', () => {
        render(<MapLegend filterStatus="incidents" />);

        expect(screen.queryByText('High-risk zone')).not.toBeInTheDocument();
        expect(screen.getByText('Active incident')).toBeInTheDocument();
    });

    test('shows only high-risk zone for the risk-zones filter', () => {
        render(<MapLegend filterStatus="risk-zones" />);

        expect(screen.getByText('High-risk zone')).toBeInTheDocument();
        expect(screen.queryByText('Verified')).not.toBeInTheDocument();
        expect(screen.queryByText('Pending')).not.toBeInTheDocument();
        expect(screen.queryByText('Responding')).not.toBeInTheDocument();
    });

    test('opens and closes the accessible mobile legend popover', () => {
        render(<MapLegend showPending />);
        const trigger = screen.getByRole('button', { name: 'Map legend' });

        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('region', { name: 'Map legend details' })).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    test('hides incident status indicators when showIncidentStatus is false', () => {
        render(<MapLegend showIncidentStatus={false} filterStatus="risk-zones" />);

        expect(screen.getByText('High-risk zone')).toBeInTheDocument();
        expect(screen.queryByText('Verified')).not.toBeInTheDocument();
        expect(screen.queryByText('Transferred')).not.toBeInTheDocument();
        expect(screen.queryByText('Responding')).not.toBeInTheDocument();
        expect(screen.queryByText('Pending')).not.toBeInTheDocument();
    });

    test('allows collapsing and expanding the desktop legend', () => {
        render(<MapLegend />);
        expect(screen.getByRole('region', { name: 'Map legend' })).toBeInTheDocument();

        const collapseBtn = screen.getByRole('button', { name: 'Collapse map legend' });
        fireEvent.click(collapseBtn);

        expect(screen.queryByRole('region', { name: 'Map legend' })).not.toBeInTheDocument();
        const expandBtn = screen.getByRole('button', { name: 'Expand map legend' });
        expect(expandBtn).toBeInTheDocument();

        fireEvent.click(expandBtn);
        expect(screen.getByRole('region', { name: 'Map legend' })).toBeInTheDocument();
    });
});

