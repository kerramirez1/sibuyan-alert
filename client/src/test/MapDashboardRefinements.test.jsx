import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from '../router';
import MapOverlayPanel from '../components/map/MapOverlayPanel';
import MapIncidentDetails from '../components/map/MapIncidentDetails';
import ImageViewer from '../components/ui/ImageViewer';
import ProtectedEvidenceGallery from '../components/report/ProtectedEvidenceGallery';
import DashboardMapWorkspace from '../components/dashboard/DashboardMapWorkspace';

const { mapPropsSpy } = vi.hoisted(() => ({ mapPropsSpy: vi.fn() }));

vi.mock('../components/map/MapView', () => ({
    default: (props) => {
        mapPropsSpy(props);
        return <div data-testid="map-view" />;
    },
}));

vi.mock('../services/api', () => ({
    reportsAPI: {
        getById: vi.fn(),
        getMyReports: vi.fn().mockResolvedValue({ data: { data: [] } }),
    },
    adminAPI: {
        getReportById: vi.fn(),
    },
    filesAPI: {
        getProtected: vi.fn().mockResolvedValue({
            data: new Blob(['fake image data'], { type: 'image/jpeg' }),
        }),
    },
}));

describe('Map Dashboard Refinements and Operational Workspace', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/fake-image');
        globalThis.URL.revokeObjectURL = vi.fn();
    });

    describe('1. MapOverlayPanel & Mobile Bottom Sheet States', () => {
        test('renders contextual inspector inside map area with predictable desktop width and scroll region', () => {
            const onClose = vi.fn();
            render(
                <div className="relative h-[600px] w-full">
                    <MapOverlayPanel
                        id="dashboard-inspector"
                        title="Incident details"
                        description="Verified emergency brief"
                        presentation="contextual"
                        onClose={onClose}
                    >
                        <div data-testid="inspector-content">Inspector content</div>
                    </MapOverlayPanel>
                </div>
            );

            const dialog = screen.getByRole('dialog', { name: 'Incident details' });
            expect(dialog).toHaveAttribute('id', 'dashboard-inspector');
            expect(dialog).toHaveAccessibleDescription('Verified emergency brief');
            expect(dialog).toHaveClass('pointer-events-auto', 'sm:w-[min(24rem,42%)]');

            const scrollRegion = screen.getByTestId('map-overlay-scroll-region');
            expect(scrollRegion).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
            expect(screen.getByTestId('inspector-content')).toBeInTheDocument();
        });

        test('handles mobile bottom sheet expand, collapse, and Escape interactions', () => {
            const onClose = vi.fn();
            render(
                <div className="relative">
                    <MapOverlayPanel
                        id="dashboard-inspector"
                        title="Incident brief"
                        presentation="contextual"
                        onClose={onClose}
                    >
                        <p>Detailed incident brief</p>
                    </MapOverlayPanel>
                </div>
            );

            const dialog = screen.getByRole('dialog', { name: 'Incident brief' });
            // Initially collapsed peek state
            expect(dialog).toHaveClass('max-sm:h-[40vh]');

            const expandBtn = screen.getByRole('button', { name: /Expand incident details/i });
            fireEvent.click(expandBtn);

            // Now expanded
            expect(dialog).toHaveClass('max-sm:h-[90vh]');

            // Pressing Escape while expanded collapses to peek state first
            fireEvent.keyDown(window, { key: 'Escape' });
            expect(dialog).toHaveClass('max-sm:h-[40vh]');
            expect(onClose).not.toHaveBeenCalled();

            // Pressing Escape while collapsed calls onClose
            fireEvent.keyDown(window, { key: 'Escape' });
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });

    describe('2. Incident Details Inspector Hierarchy, Casualties, and Actions', () => {
        const sampleReport = {
            _id: '607f1f77bcf86cd799439011',
            title: 'Vehicular Collision at San Fernando Junction',
            incidentType: 'vehicular_accident',
            status: 'verified',
            severity: 'severe',
            address: 'National Highway, San Fernando',
            barangay: 'Poblacion',
            municipalityName: 'San Fernando',
            incidentTime: '2026-08-23T07:30:00.000Z',
            description: 'Two motorcycles collided at the junction. Traffic is partially obstructed.',
            coordinates: { lat: 12.3854, lng: 122.5642 },
            responderAgency: 'PNP - San Fernando',
            casualties: {
                injured: 2,
                fatalities: 0,
                missing: 0,
            },
            affectedArea: {
                householdsAffected: 0,
                evacuees: 0,
                radius: 50,
            },
            evidence: {
                count: 1,
                viewerAccess: 'redacted',
                items: [
                    {
                        id: '0',
                        index: 0,
                        redactedPreviewUrl: '/api/reports/607f1f77bcf86cd799439011/evidence/0/preview?rv=3.4',
                        redactionType: 'public_soft_blur',
                        detectionStatus: 'privacy_derivative',
                        alt: 'Collision scene preview',
                    },
                ],
            },
            detailAccess: 'public',
            detailCompleteness: 'full',
        };

        test('renders clear visual hierarchy: header, badges, location, time, casualties, and actions', () => {
            const onLocate = vi.fn();
            render(
                <MemoryRouter>
                    <MapIncidentDetails
                        report={sampleReport}
                        viewerRole="guest"
                        onLocate={onLocate}
                    />
                </MemoryRouter>
            );

            // 1. Header & Badges
            expect(screen.getByText('Incident brief')).toBeInTheDocument();
            expect(screen.getByText('Vehicular Collision at San Fernando Junction')).toBeInTheDocument();
            expect(screen.getByText(/severe/i)).toBeInTheDocument();
            expect(screen.getByText('verified')).toBeInTheDocument();

            // 2. Location & GPS
            expect(screen.getByText(/National Highway, San Fernando/i)).toBeInTheDocument();
            expect(screen.getByText(/GPS: 12.3854, 122.5642/i)).toBeInTheDocument();

            // 3. Responding Agency & Time
            expect(screen.getByText(/PNP - San Fernando/i)).toBeInTheDocument();

            // 4. Description
            expect(screen.getByText(/Two motorcycles collided at the junction/i)).toBeInTheDocument();

            // 5. Casualties & Impact
            expect(screen.getByText('Injured')).toBeInTheDocument();
            expect(screen.getByText('2')).toBeInTheDocument();
            expect(screen.getByText('Fatalities')).toBeInTheDocument();
            expect(screen.getByText('Missing')).toBeInTheDocument();
            expect(screen.getByText(/50 meters/i)).toBeInTheDocument();

            // 6. Action button
            const locateBtn = screen.getByRole('button', { name: /View on map/i });
            fireEvent.click(locateBtn);
            expect(onLocate).toHaveBeenCalledWith(expect.objectContaining({ _id: '607f1f77bcf86cd799439011' }));
        });

        test('renders owner link when current user owns the report', () => {
            render(
                <MemoryRouter>
                    <MapIncidentDetails
                        report={{
                            ...sampleReport,
                            isOwnedByCurrentUser: true,
                            detailAccess: 'owner',
                        }}
                        viewerRole="reporter"
                    />
                </MemoryRouter>
            );

            expect(screen.getByRole('link', { name: /Open my full report/i })).toBeInTheDocument();
        });
    });

    describe('3. Evidence Privacy Derivatives and Truthful Lightbox Labels', () => {
        test('displays truthful "Privacy-safe preview · Details limited" for public_soft_blur evidence in gallery and lightbox', () => {
            const evidence = {
                count: 1,
                viewerAccess: 'redacted',
                items: [
                    {
                        id: '0',
                        index: 0,
                        redactedPreviewUrl: '/api/reports/rep-123/evidence/0/preview?rv=3.4',
                        accessLevel: 'redacted',
                        redactionType: 'public_soft_blur',
                        detectionStatus: 'privacy_derivative',
                        alt: 'Emergency scene preview',
                    },
                ],
            };

            const { unmount } = render(
                <ProtectedEvidenceGallery
                    evidence={evidence}
                    accessLevel="redacted"
                />
            );

            // Thumbnail displays Privacy-safe preview badge
            expect(screen.getByText('Privacy-safe preview')).toBeInTheDocument();
            expect(screen.queryByText(/Faces blurred for privacy/i)).not.toBeInTheDocument();

            // Click thumbnail to open lightbox
            const thumbnailBtn = screen.getByRole('button', { name: /Incident evidence photo 1/i });
            fireEvent.click(thumbnailBtn);

            // Lightbox renders truthful title and footer badge
            expect(screen.getByText('Evidence photo 1 (Privacy-safe preview)')).toBeInTheDocument();
            expect(screen.getByText('Privacy-safe preview · Details limited')).toBeInTheDocument();
            expect(screen.queryByText(/Faces redacted for privacy/i)).not.toBeInTheDocument();

            // Lightbox download button uses safe redacted filename
            const downloadAnchor = screen.getByRole('link', { name: /Download privacy-safe preview image/i });
            expect(downloadAnchor).toHaveAttribute('href', '/api/reports/rep-123/evidence/0/preview?rv=3.4');
            expect(downloadAnchor).toHaveAttribute('download', 'evidence-1-redacted.jpg');

            unmount();
        });

        test('locks and unlocks body scroll when ImageViewer opens and closes', () => {
            const onClose = vi.fn();
            const { rerender } = render(
                <ImageViewer
                    isOpen={false}
                    item={null}
                    onClose={onClose}
                />
            );

            expect(document.body.style.overflow).toBe('');

            rerender(
                <ImageViewer
                    isOpen={true}
                    item={{
                        id: '0',
                        index: 0,
                        viewerAccess: 'redacted',
                        sourceKind: 'redacted-preview',
                        src: '/api/reports/rep-123/evidence/0/preview',
                        redactedPreviewUrl: '/api/reports/rep-123/evidence/0/preview',
                        detectionStatus: 'privacy_derivative',
                        redactionType: 'public_soft_blur',
                    }}
                    onClose={onClose}
                />
            );

            expect(document.body.style.overflow).toBe('hidden');

            fireEvent.keyDown(window, { key: 'Escape' });
            expect(onClose).toHaveBeenCalled();
        });
    });

    describe('4. Filter Toolbar and Overview Metrics in DashboardMapWorkspace', () => {
        const workspaceProps = {
            user: { _id: 'user-1', role: 'guest' },
            isAuthenticated: false,
            isAdmin: false,
            isResponder: false,
            loading: false,
            error: '',
            reports: [
                {
                    _id: 'r1',
                    status: 'verified',
                    municipalityName: 'Cajidiocan',
                    incidentTime: '2026-08-23T06:00:00.000Z',
                    coordinates: { lat: 12.37, lng: 122.54 },
                },
                {
                    _id: 'r2',
                    status: 'responding',
                    municipalityName: 'Magdiwang',
                    incidentTime: '2026-08-23T07:00:00.000Z',
                    coordinates: { lat: 12.48, lng: 122.52 },
                },
            ],
            pendingReports: [],
            respondingReports: [],
            resolvedTodayReports: [],
            highRiskZones: [
                { _id: 'z1', name: 'Coastal Flood Zone', type: 'flood', coordinates: { lat: 12.35, lng: 122.50 } },
            ],
            responderMapFilter: 'all',
            setResponderMapFilter: vi.fn(),
            canCurrentResponderResolve: vi.fn(() => false),
            handleMapRespond: vi.fn(),
            handleMapResolve: vi.fn(),
            setSearchParams: vi.fn(),
            mapSummaryPanel: '',
            setMapSummaryPanel: vi.fn(),
            activePanel: null,
        };

        test('renders compact filter toolbar and allows selecting filters', () => {
            render(
                <MemoryRouter>
                    <DashboardMapWorkspace {...workspaceProps} />
                </MemoryRouter>
            );

            expect(screen.getByText('Filter by status')).toBeInTheDocument();
            const verifiedFilterBtn = screen.getByRole('button', { name: /Verified filter/i });
            expect(verifiedFilterBtn).toBeInTheDocument();

            fireEvent.click(verifiedFilterBtn);
            expect(workspaceProps.setResponderMapFilter).toHaveBeenCalledWith('verified');
        });

        test('renders 4 slim overview items with aligned values and accessible buttons', () => {
            render(
                <MemoryRouter>
                    <DashboardMapWorkspace {...workspaceProps} />
                </MemoryRouter>
            );

            const summaryRegion = screen.getByRole('region', { name: 'Map summary' });
            expect(summaryRegion).toBeInTheDocument();

            const buttons = within(summaryRegion).getAllByRole('button');
            expect(buttons).toHaveLength(4);
            buttons.forEach((btn) => {
                expect(btn).toHaveAttribute('aria-controls', 'dashboard-map-summary-panel');
            });
        });
    });
});
