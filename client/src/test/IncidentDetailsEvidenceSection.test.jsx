import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import IncidentDetailsEvidenceSection from '../components/incidentDetails/IncidentDetailsEvidenceSection';

vi.mock('../components/report/ProtectedEvidenceGallery', () => ({
    default: ({ images }) => <div data-testid="mock-evidence-gallery">{images.length} photos</div>,
}));

const baseProps = {
    images: ['/api/files/1/a.jpg', '/api/files/2/b.jpg'],
    evidence: { items: [{}, {}], evidenceCount: 2, expected: 3, pending: 1, uploadStatus: 'uploading' },
    evidenceCount: 2,
    isOperational: true,
    collapsible: false,
};

describe('IncidentDetailsEvidenceSection pending-evidence notice', () => {
    test('shows "2 of 3" in the title and the uploading notice while photos are pending', () => {
        render(<IncidentDetailsEvidenceSection {...baseProps} />);

        expect(screen.getByText('Evidence photos (2 of 3)')).toBeInTheDocument();
        expect(screen.getByText('Evidence still uploading')).toBeInTheDocument();
        expect(screen.getByText(/2 of 3 photos received/)).toBeInTheDocument();
    });

    test('says "not received" instead of uploading once the window has passed', () => {
        render(
            <IncidentDetailsEvidenceSection
                {...baseProps}
                evidence={{ ...baseProps.evidence, uploadStatus: 'incomplete' }}
            />
        );

        expect(screen.getByText('Evidence photos (2 of 3)')).toBeInTheDocument();
        expect(screen.getByText('Evidence not received')).toBeInTheDocument();
        expect(screen.queryByText('Evidence still uploading')).not.toBeInTheDocument();
    });

    test('shows "0 of 3" with the notice — never "No evidence attached" — when nothing has arrived yet', () => {
        render(
            <IncidentDetailsEvidenceSection
                {...baseProps}
                images={[]}
                evidence={{ items: [], expected: 3, pending: 3, uploadStatus: 'uploading' }}
                evidenceCount={0}
            />
        );

        expect(screen.getByText('Evidence photos (0 of 3)')).toBeInTheDocument();
        expect(screen.getByText('Evidence still uploading')).toBeInTheDocument();
        expect(screen.queryByText('No evidence attached.')).not.toBeInTheDocument();
        // The gallery has nothing to show, so its empty state cannot contradict the notice.
        expect(screen.queryByTestId('mock-evidence-gallery')).not.toBeInTheDocument();
    });

    test('renders exactly as before when there is no pending evidence', () => {
        render(
            <IncidentDetailsEvidenceSection
                {...baseProps}
                evidence={{ items: [{}, {}], evidenceCount: 2 }}
            />
        );

        expect(screen.getByText('Evidence photos (2)')).toBeInTheDocument();
        expect(screen.queryByText('Evidence still uploading')).not.toBeInTheDocument();
        expect(screen.queryByText('Evidence not received')).not.toBeInTheDocument();
        expect(screen.getByTestId('mock-evidence-gallery')).toBeInTheDocument();
    });
});
