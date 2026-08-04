import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from '../router';
import MapIncidentDetails from '../components/map/MapIncidentDetails';

const report = {
    _id: 'report-1',
    title: 'Accident at J. Rizal Street',
    incidentType: 'motorcycle',
    status: 'verified',
    severity: 'moderate',
    address: 'J. Rizal Street',
    barangay: 'Poblacion',
    municipalityName: 'Cajidiocan',
    incidentTime: '2026-08-01T02:00:00Z',
    updatedAt: '2026-08-01T03:00:00Z',
    description: '',
    fireInvolved: true,
    casualties: { injured: 2, fatalities: 0, missing: 0 },
    respondingAgencies: ['MDRRMO'],
    reporter: { name: 'Private Reporter', email: 'private@example.com' },
    images: ['/private-evidence.jpg'],
    resolutionNotes: 'Private notes',
};

const renderDetails = (props = {}) => render(
    <MemoryRouter initialEntries={['/dashboard?view=map']}>
        <MapIncidentDetails report={report} {...props} />
    </MemoryRouter>,
);

describe('MapIncidentDetails', () => {
    test('renders a useful sanitized public incident summary for guests', () => {
        const onLocate = vi.fn();
        renderDetails({ onLocate });

        expect(screen.getByText('Accident at J. Rizal Street')).toBeInTheDocument();
        expect(screen.getByText(/No additional public details were provided/i)).toBeInTheDocument();
        expect(screen.getByText('2 injured')).toBeInTheDocument();
        expect(screen.getByText('Fire or explosion involved')).toBeInTheDocument();
        expect(screen.getByText('MDRRMO')).toBeInTheDocument();
        expect(screen.queryByText('Private Reporter')).not.toBeInTheDocument();
        expect(screen.queryByText('Private notes')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /open my full report/i })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /view incident on map/i }));
        expect(onLocate).toHaveBeenCalledWith(report);
    });

    test('shows the protected full-report action only to the report owner', () => {
        renderDetails({
            viewerRole: 'reporter',
            report: { ...report, isOwnedByCurrentUser: true },
        });

        expect(screen.getByRole('link', { name: /open my full report/i }))
            .toHaveAttribute('href', '/my-reports?report=report-1');
    });

    test('keeps responder actions capability-based', () => {
        const onRespond = vi.fn();
        renderDetails({ viewerRole: 'responder', canRespond: true, onRespond });

        fireEvent.click(screen.getByRole('button', { name: /respond to incident/i }));
        expect(onRespond).toHaveBeenCalledWith(report);
        expect(screen.queryByRole('button', { name: /review resolution/i })).not.toBeInTheDocument();
    });
});
