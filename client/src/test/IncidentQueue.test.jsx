import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import IncidentQueue from '../components/adminReports/IncidentQueue';

/**
 * The triage queue must say WHAT happened at a glance: a short achromatic
 * category badge next to the severity indicator, and the incident type as
 * the card's prominent line above the address.
 */
const adminUser = { _id: 'admin-1', name: 'Maria Santos', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' };

const baseReport = {
    _id: 'report-1',
    title: 'Fire at the market',
    incidentCategory: 'fire',
    incidentType: 'structural',
    severity: 'severe',
    status: 'verified',
    address: 'Poblacion, Cajidiocan',
    description: 'Market stalls on fire.',
    createdAt: '2026-10-09T08:00:00.000Z',
    incidentTime: '2026-10-09T07:55:00.000Z',
    municipalityName: 'Cajidiocan',
};

const renderQueue = (reports) => render(
    <IncidentQueue
        reports={reports}
        loading={false}
        error=""
        user={adminUser}
        actions={{}}
        onInspect={() => {}}
    />,
);

const cardFor = (id) => screen.getByRole('article');

describe('IncidentQueue incident card — incident kind', () => {
    test.each([
        ['accident', 'vehicular', 'ACCIDENT'],
        ['fire', 'structural', 'FIRE'],
        ['crime', 'theft', 'CRIME'],
    ])('category badge renders the short label for %s', (category, type, expected) => {
        renderQueue([{ ...baseReport, incidentCategory: category, incidentType: type }]);

        const card = cardFor('report-1');
        expect(within(card).getByText(expected)).toBeInTheDocument();
    });

    test('badge is omitted when the category is missing or unknown', () => {
        const { unmount } = renderQueue([{ ...baseReport, incidentCategory: undefined }]);
        expect(within(cardFor('report-1')).queryByText(/^(ACCIDENT|FIRE|CRIME)$/)).not.toBeInTheDocument();
        unmount();

        renderQueue([{ ...baseReport, incidentCategory: 'tornado' }]);
        expect(within(cardFor('report-1')).queryByText(/^(ACCIDENT|FIRE|CRIME)$/)).not.toBeInTheDocument();
    });

    test('incident type is the prominent line above the address', () => {
        renderQueue([{ ...baseReport }]);

        const card = cardFor('report-1');
        const typeLine = within(card).getByRole('heading', { level: 2 });
        expect(typeLine).toHaveTextContent('Structural fire');
        expect(typeLine.className).toMatch(/text-\[15px\]/);
        expect(typeLine.className).toMatch(/font-semibold/);

        // The address is demoted to a secondary line below the type.
        expect(within(card).getByText('Poblacion, Cajidiocan')).toBeInTheDocument();
        // The description keeps its own line.
        expect(within(card).getByText('Market stalls on fire.')).toBeInTheDocument();
    });
});
