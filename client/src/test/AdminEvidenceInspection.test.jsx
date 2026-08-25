import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import ResponderIncidentInspector from '../components/adminReports/ResponderIncidentInspector';
import IncidentDetailsContent from '../components/incidentDetails/IncidentDetailsContent';
import ImageViewer from '../components/ui/ImageViewer';
import useOperationalIncidentDetails from '../hooks/useOperationalIncidentDetails';
import { adminAPI, filesAPI } from '../services/api';

vi.mock('../services/api', () => ({
    adminAPI: {
        getReportById: vi.fn(),
    },
    reportsAPI: {
        getById: vi.fn(),
    },
    filesAPI: {
        getProtected: vi.fn(),
    },
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../components/map/MapView', () => ({
    default: () => <div data-testid="mock-map-view" />,
}));

// Test Harness Component to test useOperationalIncidentDetails -> ResponderIncidentInspector integration
const TestInspectorWithHook = ({ initialReport, user, onViewImage }) => {
    const detailState = useOperationalIncidentDetails(initialReport, user?.role);
    return (
        <ResponderIncidentInspector
            report={detailState.report}
            user={user}
            actions={{}}
            onClose={vi.fn()}
            onOpenMap={vi.fn()}
            onViewImage={onViewImage}
            detailLoading={detailState.loading}
            detailError={detailState.error}
            detailRestricted={detailState.restricted}
            onRetryDetails={detailState.retry}
        />
    );
};

describe('Admin and Responder Incident-Inspection Evidence Flow', () => {
    const adminUser = {
        _id: 'admin-1',
        id: 'admin-1',
        name: 'Admin Maria Santos',
        email: 'admin@cajidiocan.gov.ph',
        role: 'municipal_admin',
        assignedMunicipality: 'Cajidiocan',
    };

    const responderUser = {
        _id: 'responder-1',
        id: 'responder-1',
        name: 'Responder Juan Cruz',
        email: 'responder@cajidiocan.gov.ph',
        role: 'responder',
        agency: 'PNP',
        assignedMunicipality: 'Cajidiocan',
    };

    const summaryReportWithEvidence = {
        _id: 'report-101',
        title: 'Intersection collision',
        address: 'Crossing Poblacion, Cajidiocan',
        barangay: 'Poblacion',
        municipalityName: 'Cajidiocan',
        incidentType: 'vehicular',
        severity: 'severe',
        status: 'verified',
        incidentTime: '2026-08-16T12:00:00.000Z',
        createdAt: '2026-08-16T12:10:00.000Z',
        description: 'Vehicular collision involving two motorcycles.',
        coordinates: { lat: 12.4044, lng: 122.6897 },
        casualties: { injured: 1, fatalities: 0, missing: 0 },
        evidenceCount: 1,
        evidence: {
            count: 1,
            evidenceCount: 1,
            viewerAccess: 'original',
            accessLevel: 'original',
            items: [], // Bulk summary omits item details and image URLs
        },
        detailAccess: 'operational',
        detailCompleteness: 'summary',
    };

    const fullDetailReport = {
        ...summaryReportWithEvidence,
        detailCompleteness: 'full',
        images: ['/api/files/607f1f77bcf86cd799439011/photo1.jpg'],
        evidence: {
            count: 1,
            evidenceCount: 1,
            viewerAccess: 'original',
            accessLevel: 'original',
            items: [
                {
                    id: '0',
                    index: 0,
                    originalUrl: '/api/files/607f1f77bcf86cd799439011/photo1.jpg',
                    previewUrl: '/api/files/607f1f77bcf86cd799439011/photo1.jpg',
                    accessLevel: 'original',
                    alt: 'Incident evidence photo 1',
                },
            ],
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        filesAPI.getProtected.mockResolvedValue({
            data: new Blob(['mock-binary-evidence'], { type: 'image/jpeg' }),
        });
        globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-blob-image');
        globalThis.URL.revokeObjectURL = vi.fn();
    });

    test('1. Municipal admin inspects report and renders authorized evidence image from full detail response', async () => {
        adminAPI.getReportById.mockResolvedValueOnce({
            data: {
                success: true,
                data: fullDetailReport,
            },
        });

        render(<TestInspectorWithHook initialReport={summaryReportWithEvidence} user={adminUser} />);

        // Heading must match the count (1)
        expect(await screen.findByText('Evidence photos (1)')).toBeInTheDocument();

        // Must fetch protected file with authenticated session
        await waitFor(() => {
            expect(filesAPI.getProtected).toHaveBeenCalledWith(
                '/api/files/607f1f77bcf86cd799439011/photo1.jpg',
                expect.objectContaining({ signal: expect.any(AbortSignal) })
            );
        });

        // Must render the authorized thumbnail button
        const thumbnailBtn = await screen.findByRole('button', { name: /View evidence photo 1/i });
        expect(thumbnailBtn).toBeInTheDocument();
        const img = within(thumbnailBtn).getByRole('img');
        expect(img).toHaveAttribute('src', 'blob:http://localhost/mock-blob-image');

        // Must not show "No evidence attached."
        expect(screen.queryByText('No evidence attached.')).not.toBeInTheDocument();
    });

    test('2. Responder inspects report and renders authorized evidence image', async () => {
        adminAPI.getReportById.mockResolvedValueOnce({
            data: {
                success: true,
                data: fullDetailReport,
            },
        });

        render(<TestInspectorWithHook initialReport={summaryReportWithEvidence} user={responderUser} />);

        expect(await screen.findByText('Evidence photos (1)')).toBeInTheDocument();

        await waitFor(() => {
            expect(filesAPI.getProtected).toHaveBeenCalledWith(
                '/api/files/607f1f77bcf86cd799439011/photo1.jpg',
                expect.objectContaining({ signal: expect.any(AbortSignal) })
            );
        });

        expect(screen.getByRole('button', { name: /View evidence photo 1/i })).toBeInTheDocument();
        expect(screen.queryByText('No evidence attached.')).not.toBeInTheDocument();
    });

    test('3. Heading count and rendered item count strictly match for multi-item evidence', async () => {
        const multiReport = {
            ...fullDetailReport,
            evidenceCount: 2,
            images: [
                '/api/files/607f1f77bcf86cd799439011/photo1.jpg',
                '/api/files/607f1f77bcf86cd799439011/photo2.jpg',
            ],
            evidence: {
                count: 2,
                evidenceCount: 2,
                viewerAccess: 'original',
                accessLevel: 'original',
                items: [
                    { id: '0', index: 0, originalUrl: '/api/files/607f1f77bcf86cd799439011/photo1.jpg', accessLevel: 'original' },
                    { id: '1', index: 1, originalUrl: '/api/files/607f1f77bcf86cd799439011/photo2.jpg', accessLevel: 'original' },
                ],
            },
        };

        render(
            <IncidentDetailsContent
                report={multiReport}
                user={adminUser}
                viewerRole="municipal_admin"
            />
        );

        expect(screen.getByText('Evidence photos (2)')).toBeInTheDocument();

        await waitFor(() => {
            const buttons = screen.getAllByRole('button', { name: /View evidence photo/i });
            expect(buttons).toHaveLength(2);
        });
    });

    test('4. Guest and unauthenticated viewers do NOT receive or render original evidence URLs', () => {
        render(
            <IncidentDetailsContent
                report={fullDetailReport}
                viewerRole="guest"
            />
        );

        // Guest visibility rules suppress evidence gallery section in inspector
        expect(screen.queryByText(/Evidence photos/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /View evidence photo/i })).not.toBeInTheDocument();
        expect(filesAPI.getProtected).not.toHaveBeenCalled();
    });

    test('5. Missing or unavailable image references display "Evidence preview unavailable" instead of "No evidence attached"', async () => {
        // Report has evidenceCount = 1, but detail endpoint returned no valid URLs
        const missingUrlReport = {
            ...summaryReportWithEvidence,
            detailCompleteness: 'full',
            images: [],
            evidenceCount: 1,
            evidence: {
                count: 1,
                evidenceCount: 1,
                viewerAccess: 'original',
                accessLevel: 'original',
                items: [], // Missing items
            },
        };

        render(
            <IncidentDetailsContent
                report={missingUrlReport}
                user={adminUser}
                viewerRole="municipal_admin"
            />
        );

        // Heading reflects evidenceCount (1)
        expect(screen.getByText('Evidence photos (1)')).toBeInTheDocument();

        // Must display unavailable state tile for the missing item rather than "No evidence attached"
        expect(await screen.findByText('Evidence preview unavailable')).toBeInTheDocument();
        expect(screen.queryByText('No evidence attached.')).not.toBeInTheDocument();
    });

    test('6. Empty evidence report renders clean empty state without heading', () => {
        const noEvidenceReport = {
            ...summaryReportWithEvidence,
            evidenceCount: 0,
            images: [],
            evidence: {
                count: 0,
                evidenceCount: 0,
                viewerAccess: 'none',
                items: [],
            },
        };

        render(
            <IncidentDetailsContent
                report={noEvidenceReport}
                user={adminUser}
                viewerRole="municipal_admin"
            />
        );

        // Section returns null when totalCount is 0
        expect(screen.queryByText(/Evidence photos/i)).not.toBeInTheDocument();
    });

    test('7. Summary item transitions to full detail response seamlessly', async () => {
        let resolveDetail;
        const detailPromise = new Promise((resolve) => {
            resolveDetail = resolve;
        });

        adminAPI.getReportById.mockReturnValueOnce(detailPromise);

        render(<TestInspectorWithHook initialReport={summaryReportWithEvidence} user={adminUser} />);

        // Initially shows loading banner
        expect(screen.getByText(/Loading protected incident details/i)).toBeInTheDocument();

        // Resolve detail response
        resolveDetail({
            data: {
                success: true,
                data: fullDetailReport,
            },
        });

        // Header and thumbnail load
        expect(await screen.findByText('Evidence photos (1)')).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /View evidence photo 1/i })).toBeInTheDocument();
        });
    });

    test('8. Clicking thumbnail in inspector calls onViewImage callback', async () => {
        const handleViewImage = vi.fn();
        adminAPI.getReportById.mockResolvedValueOnce({
            data: {
                success: true,
                data: fullDetailReport,
            },
        });

        render(
            <TestInspectorWithHook
                initialReport={summaryReportWithEvidence}
                user={adminUser}
                onViewImage={handleViewImage}
            />
        );

        const btn = await screen.findByRole('button', { name: /View evidence photo 1/i });
        fireEvent.click(btn);

        expect(handleViewImage).toHaveBeenCalledWith(
            expect.objectContaining({
                originalUrl: '/api/files/607f1f77bcf86cd799439011/photo1.jpg',
                viewerAccess: 'original',
            }),
            0,
            expect.any(Array)
        );
    });

    test('9. Viewer is portaled to document.body and overlays inspector drawer with single instance', async () => {
        adminAPI.getReportById.mockResolvedValueOnce({
            data: {
                success: true,
                data: fullDetailReport,
            },
        });

        // Test component rendering both inspector and page-level ImageViewer
        const TestPage = () => {
            const [selectedImage, setSelectedImage] = useState(null);
            const detailState = useOperationalIncidentDetails(summaryReportWithEvidence, adminUser.role);
            return (
                <div data-testid="page-container" className="transform-gpu overflow-hidden">
                    <ResponderIncidentInspector
                        report={detailState.report}
                        user={adminUser}
                        actions={{}}
                        onClose={vi.fn()}
                        onOpenMap={vi.fn()}
                        onViewImage={(item) => setSelectedImage(item)}
                        detailLoading={detailState.loading}
                    />
                    <ImageViewer
                        isOpen={Boolean(selectedImage)}
                        item={selectedImage}
                        onClose={() => setSelectedImage(null)}
                    />
                </div>
            );
        };

        render(<TestPage />);

        // Drawer is portaled to document.body
        const inspector = await screen.findByTestId('responder-incident-inspector');
        expect(inspector.parentElement).toBe(document.body);

        // Click evidence photo to open viewer
        const thumbnailBtn = await screen.findByRole('button', { name: /View evidence photo 1/i });
        fireEvent.click(thumbnailBtn);

        // Exactly one ImageViewer dialog is mounted and portaled to document.body
        const dialogs = screen.getAllByRole('dialog', { name: /Enlarged evidence image viewer/i });
        expect(dialogs).toHaveLength(1);
    });

    test('10. Backdrop click closes evidence viewer without closing inspector drawer', async () => {
        adminAPI.getReportById.mockResolvedValueOnce({
            data: {
                success: true,
                data: fullDetailReport,
            },
        });

        const handleCloseDrawer = vi.fn();

        const TestPage = () => {
            const [selectedImage, setSelectedImage] = useState(null);
            const detailState = useOperationalIncidentDetails(summaryReportWithEvidence, adminUser.role);
            return (
                <div>
                    <ResponderIncidentInspector
                        report={detailState.report}
                        user={adminUser}
                        actions={{}}
                        onClose={handleCloseDrawer}
                        onOpenMap={vi.fn()}
                        onViewImage={(item) => setSelectedImage(item)}
                        detailLoading={detailState.loading}
                    />
                    <ImageViewer
                        isOpen={Boolean(selectedImage)}
                        item={selectedImage}
                        onClose={() => setSelectedImage(null)}
                    />
                </div>
            );
        };

        render(<TestPage />);

        const thumbnailBtn = await screen.findByRole('button', { name: /View evidence photo 1/i });
        fireEvent.click(thumbnailBtn);

        const viewerDialog = screen.getByRole('dialog', { name: /Enlarged evidence image viewer/i });
        expect(viewerDialog).toBeInTheDocument();

        // Click backdrop (outermost modal container)
        fireEvent.click(viewerDialog);

        // Viewer closes
        expect(screen.queryByRole('dialog', { name: /Enlarged evidence image viewer/i })).not.toBeInTheDocument();

        // Inspector drawer remains open and unclosed
        expect(handleCloseDrawer).not.toHaveBeenCalled();
        expect(screen.getByTestId('responder-incident-inspector')).toBeInTheDocument();
    });

    test('11. Escape key closes evidence viewer and preserves inspector state', async () => {
        adminAPI.getReportById.mockResolvedValueOnce({
            data: {
                success: true,
                data: fullDetailReport,
            },
        });

        const handleCloseDrawer = vi.fn();

        const TestPage = () => {
            const [selectedImage, setSelectedImage] = useState(null);
            const detailState = useOperationalIncidentDetails(summaryReportWithEvidence, adminUser.role);
            return (
                <div>
                    <ResponderIncidentInspector
                        report={detailState.report}
                        user={adminUser}
                        actions={{}}
                        onClose={handleCloseDrawer}
                        onOpenMap={vi.fn()}
                        onViewImage={(item) => setSelectedImage(item)}
                        detailLoading={detailState.loading}
                    />
                    <ImageViewer
                        isOpen={Boolean(selectedImage)}
                        item={selectedImage}
                        onClose={() => setSelectedImage(null)}
                    />
                </div>
            );
        };

        render(<TestPage />);

        const thumbnailBtn = await screen.findByRole('button', { name: /View evidence photo 1/i });
        fireEvent.click(thumbnailBtn);

        expect(screen.getByRole('dialog', { name: /Enlarged evidence image viewer/i })).toBeInTheDocument();

        // Press Escape
        fireEvent.keyDown(window, { key: 'Escape' });

        // Viewer closes
        expect(screen.queryByRole('dialog', { name: /Enlarged evidence image viewer/i })).not.toBeInTheDocument();

        // Inspector drawer remains open and unclosed
        expect(handleCloseDrawer).not.toHaveBeenCalled();
        expect(screen.getByTestId('responder-incident-inspector')).toBeInTheDocument();
    });

    test('12. No download button rendered in admin/responder inspection viewer', async () => {
        adminAPI.getReportById.mockResolvedValueOnce({
            data: {
                success: true,
                data: fullDetailReport,
            },
        });

        const TestPage = () => {
            const [selectedImage, setSelectedImage] = useState(null);
            const detailState = useOperationalIncidentDetails(summaryReportWithEvidence, adminUser.role);
            return (
                <div>
                    <ResponderIncidentInspector
                        report={detailState.report}
                        user={adminUser}
                        actions={{}}
                        onClose={vi.fn()}
                        onOpenMap={vi.fn()}
                        onViewImage={(item) => setSelectedImage(item)}
                        detailLoading={detailState.loading}
                    />
                    <ImageViewer
                        isOpen={Boolean(selectedImage)}
                        item={selectedImage}
                        onClose={() => setSelectedImage(null)}
                    />
                </div>
            );
        };

        render(<TestPage />);

        const thumbnailBtn = await screen.findByRole('button', { name: /View evidence photo 1/i });
        fireEvent.click(thumbnailBtn);

        expect(screen.getByRole('dialog', { name: /Enlarged evidence image viewer/i })).toBeInTheDocument();

        // Confirm NO download control is rendered
        expect(screen.queryByRole('link', { name: /Download/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Download/i })).not.toBeInTheDocument();
    });

    test('13. Municipal admin inspects report with multiple evidence photos and navigates forward and backward', async () => {
        const multiEvidenceReport = {
            ...fullDetailReport,
            evidenceCount: 3,
            images: [
                '/api/files/607f1f77bcf86cd799439011/photo1.jpg',
                '/api/files/607f1f77bcf86cd799439011/photo2.jpg',
                '/api/files/607f1f77bcf86cd799439011/photo3.jpg',
            ],
            evidence: {
                count: 3,
                evidenceCount: 3,
                viewerAccess: 'original',
                accessLevel: 'original',
                items: [
                    { id: '0', index: 0, originalUrl: '/api/files/607f1f77bcf86cd799439011/photo1.jpg', previewUrl: '/api/files/607f1f77bcf86cd799439011/photo1.jpg', accessLevel: 'original', alt: 'Incident photo 1' },
                    { id: '1', index: 1, originalUrl: '/api/files/607f1f77bcf86cd799439011/photo2.jpg', previewUrl: '/api/files/607f1f77bcf86cd799439011/photo2.jpg', accessLevel: 'original', alt: 'Incident photo 2' },
                    { id: '2', index: 2, originalUrl: '/api/files/607f1f77bcf86cd799439011/photo3.jpg', previewUrl: '/api/files/607f1f77bcf86cd799439011/photo3.jpg', accessLevel: 'original', alt: 'Incident photo 3' },
                ],
            },
        };

        adminAPI.getReportById.mockResolvedValueOnce({
            data: {
                success: true,
                data: multiEvidenceReport,
            },
        });

        const TestMultiPage = () => {
            const [selectedImage, setSelectedImage] = useState(null);
            const detailState = useOperationalIncidentDetails({ ...summaryReportWithEvidence, evidenceCount: 3 }, adminUser.role);
            return (
                <div>
                    <ResponderIncidentInspector
                        report={detailState.report}
                        user={adminUser}
                        actions={{}}
                        onClose={vi.fn()}
                        onOpenMap={vi.fn()}
                        onViewImage={(item) => setSelectedImage(item)}
                        detailLoading={detailState.loading}
                    />
                    <ImageViewer
                        isOpen={Boolean(selectedImage)}
                        item={selectedImage}
                        onClose={() => setSelectedImage(null)}
                    />
                </div>
            );
        };

        render(<TestMultiPage />);

        const thumbnailBtn = await screen.findByRole('button', { name: /View evidence photo 1/i });
        fireEvent.click(thumbnailBtn);

        // Viewer opens with "Evidence photo 1 of 3"
        const dialog = screen.getByRole('dialog', { name: /Enlarged evidence image viewer/i });
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo 1 of 3');

        // Click next button
        const nextBtn = within(dialog).getAllByRole('button', { name: /Next evidence photo/i })[0];
        fireEvent.click(nextBtn);

        expect(within(dialog).getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo 2 of 3');

        // Navigate with ArrowRight keyboard shortcut
        fireEvent.keyDown(window, { key: 'ArrowRight' });
        expect(within(dialog).getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo 3 of 3');

        // Navigate with ArrowLeft keyboard shortcut
        fireEvent.keyDown(window, { key: 'ArrowLeft' });
        expect(within(dialog).getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo 2 of 3');
    });
});
