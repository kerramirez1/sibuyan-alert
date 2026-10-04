import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../services/api', () => ({
    highRiskZonesAPI: { getAll: vi.fn() },
}));

import { highRiskZonesAPI } from '../services/api';
import HighRiskZoneList from '../components/map/HighRiskZoneList';

const zones = [
    {
        _id: 'zone-1',
        name: 'Landslide Area',
        type: 'landslide_prone',
        severity: 'high',
        municipality: 'Cajidiocan',
        coordinates: { lat: 12.3, lng: 122.5 },
    },
];

describe('HighRiskZoneList CSS expand', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        highRiskZonesAPI.getAll.mockResolvedValue({ data: { data: zones } });
    });

    test('toggles grid-rows classes when collapsing and expanding', async () => {
        render(<HighRiskZoneList isExpanded />);

        await waitFor(() => expect(screen.getByText('Landslide Area')).toBeInTheDocument());

        const header = screen.getByRole('button', { name: /High-Risk Zones/i });
        const panel = header.nextElementSibling;

        // Open: full row, visible.
        expect(panel).toHaveClass('grid-rows-[1fr]', 'opacity-100');
        expect(panel).not.toHaveClass('invisible');

        fireEvent.click(header);

        // Collapsed: zero row, faded, and out of the tab order.
        expect(panel).toHaveClass('grid-rows-[0fr]', 'opacity-0', 'invisible');

        fireEvent.click(header);

        expect(panel).toHaveClass('grid-rows-[1fr]', 'opacity-100');
        expect(panel).not.toHaveClass('invisible');
    });

    test('zone buttons use CSS hover nudge and tap scale instead of motion props', async () => {
        render(<HighRiskZoneList isExpanded />);

        await waitFor(() => expect(screen.getByText('Landslide Area')).toBeInTheDocument());

        const zoneButton = screen.getByRole('button', { name: /Landslide Area/ });
        expect(zoneButton).toHaveClass('hover:translate-x-1', 'active:scale-[0.98]');
        expect(zoneButton.className).toContain('transition-[color,background-color,transform]');
    });
});
