import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import IncidentDetailsReporterSection from '../components/incidentDetails/IncidentDetailsReporterSection';

describe('IncidentDetailsReporterSection', () => {
    test('renders reporter name and verified badge when reporter is verified', () => {
        render(
            <IncidentDetailsReporterSection
                reporter={{
                    name: 'Maria Santos',
                    email: 'maria@example.com',
                    isVerified: true,
                }}
                showContact={true}
            />
        );

        expect(screen.getByText('Maria Santos')).toBeInTheDocument();
        const badge = screen.getByRole('status', { name: 'Verified reporter' });
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveAttribute('title', 'Verified reporter');
        expect(screen.getByText('maria@example.com')).toBeInTheDocument();
    });

    test('renders reporter name without badge when reporter is not verified', () => {
        render(
            <IncidentDetailsReporterSection
                reporter={{
                    name: 'Carlos Reyes',
                    email: 'carlos@example.com',
                    isVerified: false,
                }}
            />
        );

        expect(screen.getByText('Carlos Reyes')).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: 'Verified reporter' })).not.toBeInTheDocument();
    });

    test('returns null when reporter object is empty or missing name/email', () => {
        const { container } = render(
            <IncidentDetailsReporterSection reporter={{}} />
        );
        expect(container.firstChild).toBeNull();
    });

    test('does not render verified badge for responder or non-reporter role', () => {
        render(
            <IncidentDetailsReporterSection
                reporter={{
                    name: 'Responder Officer',
                    email: 'officer@example.com',
                    role: 'responder',
                    isVerified: true,
                }}
            />
        );

        expect(screen.getByText('Responder Officer')).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: 'Verified reporter' })).not.toBeInTheDocument();
    });
});
