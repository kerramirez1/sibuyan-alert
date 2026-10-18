import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import OperationalIncidentSections from '../components/map/OperationalIncidentSections';

vi.mock('../report/ProtectedEvidenceGallery', () => ({
    default: () => <div data-testid="mock-gallery" />,
}));

describe('OperationalIncidentSections', () => {
    const baseReport = {
        _id: 'report-op-1',
        title: 'Road blockage',
        reporter: {
            name: 'Elena Ramos',
            email: 'elena@example.com',
            isVerified: true,
        },
        reportUpdates: [],
        responders: [],
    };

    test('renders verified reporter badge beside reporter name when verified', () => {
        render(<OperationalIncidentSections report={baseReport} />);

        expect(screen.getByText('Elena Ramos')).toBeInTheDocument();
        const badge = screen.getByRole('status', { name: 'Verified reporter' });
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveAttribute('title', 'Verified reporter');
    });

    test('renders reporter name without verified badge when unverified', () => {
        const unverifiedReport = {
            ...baseReport,
            reporter: {
                name: 'Pedro Cruz',
                email: 'pedro@example.com',
                isVerified: false,
            },
        };
        render(<OperationalIncidentSections report={unverifiedReport} />);

        expect(screen.getByText('Pedro Cruz')).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: 'Verified reporter' })).not.toBeInTheDocument();
    });

    test('does not render verified badge when reporter has responder or non-reporter role', () => {
        const responderReport = {
            ...baseReport,
            reporter: {
                name: 'Officer Reyes',
                email: 'reyes@example.com',
                role: 'responder',
                isVerified: true,
            },
        };
        render(<OperationalIncidentSections report={responderReport} />);

        expect(screen.getByText('Officer Reyes')).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: 'Verified reporter' })).not.toBeInTheDocument();
    });
});

describe('OperationalIncidentSections — resolution photos section gating', () => {
    const baseReport = {
        _id: 'report-op-1',
        title: 'Road blockage',
        reporter: { name: 'Elena Ramos', email: 'elena@example.com', isVerified: true },
        reportUpdates: [],
        responders: [],
    };

    test('hides the resolution photos section for a responding incident', () => {
        render(<OperationalIncidentSections report={{ ...baseReport, status: 'responding' }} />);

        expect(screen.queryByText(/Resolution photos/)).not.toBeInTheDocument();
    });

    test('shows the resolution photos section with count 0 for a resolved incident without photos', () => {
        render(<OperationalIncidentSections report={{ ...baseReport, status: 'resolved', resolutionImages: [] }} />);

        expect(screen.getByText('Resolution photos (0)')).toBeInTheDocument();
    });

    test('shows the resolution photos section with photos for a resolved incident', () => {
        render(
            <OperationalIncidentSections
                report={{ ...baseReport, status: 'resolved', resolutionImages: ['/res1.jpg', '/res2.jpg'] }}
            />
        );

        expect(screen.getByText('Resolution photos (2)')).toBeInTheDocument();
    });
});
