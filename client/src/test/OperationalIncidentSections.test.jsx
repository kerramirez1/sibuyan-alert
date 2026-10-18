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

    test('shows the expected count and an uploading notice while photos are pending', () => {
        render(
            <OperationalIncidentSections
                report={{
                    ...baseReport,
                    images: [],
                    evidenceCount: 0,
                    evidence: { expected: 3, pending: 3, uploadStatus: 'uploading' },
                }}
            />
        );

        expect(screen.getByText('Evidence photos (0 of 3)')).toBeInTheDocument();
        expect(screen.getByText('Evidence still uploading')).toBeInTheDocument();
        expect(screen.getByText(/0 of 3 photos received/)).toBeInTheDocument();
    });

    test('says not received instead of uploading once the window has passed', () => {
        render(
            <OperationalIncidentSections
                report={{
                    ...baseReport,
                    images: [],
                    evidenceCount: 0,
                    evidence: { expected: 3, pending: 3, uploadStatus: 'incomplete' },
                }}
            />
        );

        expect(screen.getByText('Evidence not received')).toBeInTheDocument();
        expect(screen.queryByText('Evidence still uploading')).not.toBeInTheDocument();
    });

    test('renders the evidence section exactly as before when nothing is pending', () => {
        render(
            <OperationalIncidentSections
                report={{
                    ...baseReport,
                    images: [],
                    evidenceCount: 0,
                    evidence: { expected: 0, pending: 0, uploadStatus: 'complete' },
                }}
            />
        );

        expect(screen.getByText('Evidence photos (0)')).toBeInTheDocument();
        expect(screen.queryByText('Evidence still uploading')).not.toBeInTheDocument();
        expect(screen.queryByText('Evidence not received')).not.toBeInTheDocument();
    });
});
