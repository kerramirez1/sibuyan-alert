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
            expect(dialog).toHaveClass('max-sm:h-[38vh]');

            const expandBtn = screen.getByRole('button', { name: /Expand incident details/i });
            fireEvent.click(expandBtn);

            // Now expanded
            expect(dialog).toHaveClass('max-sm:h-[88vh]');

            // Pressing Escape while expanded collapses to peek state first
            fireEvent.keyDown(window, { key: 'Escape' });
            expect(dialog).toHaveClass('max-sm:h-[38vh]');
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

        test('renders clear visual hierarchy: header, badges, location, time, casualties, and privacy notice without redundant map actions', () => {
            render(
                <MemoryRouter>
                    <MapIncidentDetails
                        report={sampleReport}
                        viewerRole="guest"
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

            // 6. Privacy notice and no redundant action buttons
            expect(screen.getByText(/Personal identities and original evidence are protected/i)).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /View on map/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Respond to incident/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Review resolution/i })).not.toBeInTheDocument();
        });

        test('does not render full report link when current user owns the report on the map', () => {
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

            expect(screen.queryByRole('link', { name: /Open my full report/i })).not.toBeInTheDocument();
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
            expect(screen.getByText('Evidence photo 1')).toBeInTheDocument();
            expect(screen.getByText(/Privacy-safe preview · Original evidence restricted/i)).toBeInTheDocument();
            expect(screen.queryByText(/Faces redacted for privacy/i)).not.toBeInTheDocument();

            // Lightbox strictly NEVER renders a download control
            expect(screen.queryByRole('link', { name: /Download/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Download/i })).not.toBeInTheDocument();

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

        test('renders 4 slim overview items with aligned values, chevrons, and accessible button semantics', () => {
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
                expect(btn).toHaveAttribute('type', 'button');
                expect(btn).toHaveAttribute('aria-controls', 'dashboard-map-summary-panel');
                expect(btn).toHaveAttribute('aria-pressed');
                expect(btn).toHaveAttribute('aria-expanded');
                expect(btn).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-inset');
            });

            // Verify the 4 labeled actions exist with full text
            expect(within(summaryRegion).getAllByText('Active incidents').length).toBeGreaterThanOrEqual(1);
            expect(within(summaryRegion).getByText('Active response')).toBeInTheDocument();
            expect(within(summaryRegion).getByText('Transferred')).toBeInTheDocument();
            expect(within(summaryRegion).getByText('Risk zones')).toBeInTheDocument();
        });

        test('navigates and synchronizes selection state when overview metric buttons are clicked', () => {
            const setMapSummaryPanel = vi.fn();
            const { rerender } = render(
                <MemoryRouter>
                    <DashboardMapWorkspace
                        {...workspaceProps}
                        setMapSummaryPanel={setMapSummaryPanel}
                        mapSummaryPanel=""
                    />
                </MemoryRouter>
            );

            const summaryRegion = screen.getByRole('region', { name: 'Map summary' });
            const activeIncidentsBtn = within(summaryRegion).getByRole('button', { name: /Active incidents/i });
            const riskZonesBtn = within(summaryRegion).getByRole('button', { name: /Risk zones/i });

            expect(activeIncidentsBtn).toHaveAttribute('aria-pressed', 'false');

            fireEvent.click(activeIncidentsBtn);
            expect(setMapSummaryPanel).toHaveBeenCalledWith('overview:public-active');

            fireEvent.click(riskZonesBtn);
            expect(setMapSummaryPanel).toHaveBeenCalledWith('overview:public-risk-zones');

            // Rerender with active panel to verify visual and accessibility selected state
            rerender(
                <MemoryRouter>
                    <DashboardMapWorkspace
                        {...workspaceProps}
                        setMapSummaryPanel={setMapSummaryPanel}
                        mapSummaryPanel="overview:public-active"
                    />
                </MemoryRouter>
            );

            const updatedActiveBtn = within(screen.getByRole('region', { name: 'Map summary' })).getByRole('button', { name: /Active incidents/i });
            expect(updatedActiveBtn).toHaveAttribute('aria-pressed', 'true');
            expect(updatedActiveBtn).toHaveAttribute('aria-expanded', 'true');
        });

        test('overview metric items do not use truncate on essential labels and enable natural text wrapping', () => {
            render(
                <MemoryRouter>
                    <DashboardMapWorkspace {...workspaceProps} />
                </MemoryRouter>
            );

            const summaryRegion = screen.getByRole('region', { name: 'Map summary' });
            const buttons = within(summaryRegion).getAllByRole('button');

            buttons.forEach((btn) => {
                const labelSpan = btn.querySelector('span.uppercase');
                expect(labelSpan).toBeInTheDocument();
                // Labels must have break-words and leading-tight for responsive reflow without truncation
                expect(labelSpan.className).toContain('break-words');
                expect(labelSpan.className).not.toContain('truncate');

                // Helper text must also wrap cleanly without single-line clipping
                const helperP = btn.querySelector('p.text-gray-500, p.text-gray-400');
                if (helperP) {
                    expect(helperP.className).toContain('break-words');
                    expect(helperP.className).not.toContain('truncate');
                }
            });
        });

        test('shows Clear filter button only when a non-default filter is active', () => {
            const { rerender } = render(
                <MemoryRouter>
                    <DashboardMapWorkspace {...workspaceProps} responderMapFilter="all" />
                </MemoryRouter>
            );

            expect(screen.queryByRole('button', { name: /Clear active filter and show all/i })).not.toBeInTheDocument();

            rerender(
                <MemoryRouter>
                    <DashboardMapWorkspace {...workspaceProps} responderMapFilter="verified" />
                </MemoryRouter>
            );

            const clearBtns = screen.getAllByRole('button', { name: /Clear active filter and show all/i });
            expect(clearBtns.length).toBeGreaterThanOrEqual(1);
            fireEvent.click(clearBtns[0]);
            expect(workspaceProps.setResponderMapFilter).toHaveBeenCalledWith('all');
        });
    });

    describe('5. ImageViewer Zoom Controls & Keyboard Navigation', () => {
        test('zooms in and out with + and - keyboard shortcuts and provides Escape-to-close', () => {
            const onClose = vi.fn();
            render(
                <ImageViewer
                    isOpen={true}
                    item={{
                        id: '0',
                        index: 0,
                        viewerAccess: 'original',
                        sourceKind: 'authorized-original',
                        src: 'blob:http://localhost/photo.jpg',
                        isOwner: true,
                    }}
                    onClose={onClose}
                />
            );

            const zoomBtn = screen.getByRole('button', { name: /Zoom in image/i });
            expect(zoomBtn).toBeInTheDocument();

            // Press '+' to zoom in
            fireEvent.keyDown(window, { key: '+' });
            expect(screen.getByRole('button', { name: /Zoom out image/i })).toBeInTheDocument();

            // Press '-' to zoom out
            fireEvent.keyDown(window, { key: '-' });
            expect(screen.getByRole('button', { name: /Zoom in image/i })).toBeInTheDocument();

            // Press 'Escape' to close
            fireEvent.keyDown(window, { key: 'Escape' });
            expect(onClose).toHaveBeenCalled();
        });
    });

    describe('6. Empty, Loading, and Unrecorded State Handling in Inspector', () => {
        test('renders quiet indicator when no casualties or impacts are recorded', () => {
            const cleanReport = {
                _id: 'report-clean',
                title: 'Minor Road Hazard in Magdiwang',
                incidentType: 'road_hazard',
                status: 'verified',
                severity: 'minor',
                address: 'Main Street, Magdiwang',
                barangay: 'Poblacion',
                municipalityName: 'Magdiwang',
                incidentTime: '2026-08-24T10:00:00.000Z',
                description: '',
                coordinates: { lat: 12.48, lng: 122.51 },
                casualties: { injured: 0, fatalities: 0, missing: 0 },
                affectedArea: { householdsAffected: 0, evacuees: 0, radius: 0 },
                detailAccess: 'public',
                detailCompleteness: 'full',
            };

            render(
                <MemoryRouter>
                    <MapIncidentDetails
                        report={cleanReport}
                        viewerRole="guest"
                    />
                </MemoryRouter>
            );

            expect(screen.getByText(/No description provided\./i)).toBeInTheDocument();
            expect(screen.getByText(/No casualties or affected-area impacts recorded\./i)).toBeInTheDocument();
        });
    });

    describe('7. Mobile Map Layout & Incident Details Bottom Sheet MVP', () => {
        const fullReport = {
            _id: 'report-mobile-test',
            title: 'Bridge Obstruction in Cajidiocan',
            incidentType: 'road_hazard',
            status: 'responding',
            severity: 'severe',
            address: 'National Highway, Cajidiocan',
            barangay: 'Sugod',
            municipalityName: 'Cajidiocan',
            incidentTime: '2026-08-25T08:30:00.000Z',
            description: 'Fallen tree blocking both lanes near bridge approach.',
            coordinates: { lat: 12.38, lng: 122.56 },
            casualties: { injured: 1, fatalities: 0, missing: 0 },
            affectedArea: { householdsAffected: 0, evacuees: 0, radius: 25 },
            responderAgency: 'MDRRMO - Cajidiocan',
            evidence: {
                count: 1,
                viewerAccess: 'redacted',
                items: [{
                    id: '0',
                    index: 0,
                    redactedPreviewUrl: '/api/reports/report-mobile-test/evidence/0/preview',
                    redactionType: 'public_soft_blur',
                    detectionStatus: 'privacy_derivative',
                    alt: 'Bridge obstruction photo',
                }],
            },
        };

        test('renders collapsed bottom sheet and expands to 88-92vh with internal scroll and fixed header', () => {
            const onClose = vi.fn();
            render(
                <MemoryRouter>
                    <div className="relative">
                        <MapOverlayPanel
                            title="Incident details"
                            description="Live operational report"
                            presentation="contextual"
                            onClose={onClose}
                        >
                            <MapIncidentDetails
                                report={fullReport}
                                viewerRole="guest"
                            />
                        </MapOverlayPanel>
                    </div>
                </MemoryRouter>
            );

            const dialog = screen.getByRole('dialog', { name: 'Incident details' });
            expect(dialog).toHaveClass('max-sm:h-[38vh]');

            const scrollRegion = screen.getByTestId('map-overlay-scroll-region');
            expect(scrollRegion).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');

            // Header is fixed at top
            const header = dialog.querySelector('header');
            expect(header).toHaveClass('shrink-0', 'max-sm:cursor-pointer');

            // Tap header to expand
            fireEvent.click(header);
            expect(dialog).toHaveClass('max-sm:h-[88vh]', 'max-sm:max-h-[92vh]');

            // All incident sections are accessible
            expect(screen.getByText('Bridge Obstruction in Cajidiocan')).toBeInTheDocument();
            expect(screen.getByText('Fallen tree blocking both lanes near bridge approach.')).toBeInTheDocument();
            expect(screen.getByText('MDRRMO - Cajidiocan')).toBeInTheDocument();
            expect(screen.getByText(/Original evidence is available only to the report owner/i)).toBeInTheDocument();

            // Swipe down collapses to peek
            fireEvent.touchStart(header, { touches: [{ clientY: 100 }] });
            fireEvent.touchEnd(header, { changedTouches: [{ clientY: 160 }] });
            expect(dialog).toHaveClass('max-sm:h-[38vh]');
            expect(onClose).not.toHaveBeenCalled();

            // Swipe down from peek closes sheet
            fireEvent.touchStart(header, { touches: [{ clientY: 200 }] });
            fireEvent.touchEnd(header, { changedTouches: [{ clientY: 260 }] });
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });
});
