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
