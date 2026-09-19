import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from '../router';
import MapOverlayPanel from '../components/map/MapOverlayPanel';
import MapIncidentDetails from '../components/map/MapIncidentDetails';
import ImageViewer from '../components/ui/ImageViewer';
import ProtectedEvidenceGallery from '../components/report/ProtectedEvidenceGallery';
import DashboardMapWorkspace from '../components/dashboard/DashboardMapWorkspace';
import { clearBlobCache } from '../utils/blobCache';

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
    // Mounting the inspector IS a reach view, so the mock has to expose the
    // recorder the hook imports.
    viewsAPI: {
        recordViewEvent: vi.fn(() => Promise.resolve({ data: { data: { counted: true } } })),
    },
}));

const mockMobileViewport = () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === '(max-width: 639px)',
        media: query,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));

    return () => {
        window.matchMedia = originalMatchMedia;
    };
};

describe('Map Dashboard Refinements and Operational Workspace', () => {
    beforeEach(() => {
        clearBlobCache();
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
            const restoreMatchMedia = mockMobileViewport();
            const onClose = vi.fn();
            const { unmount } = render(
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
            // Compact sheet remains scrollable without being translated off-screen.
            expect(dialog).toHaveClass('max-sm:h-[38dvh]', 'max-sm:transition-[height]');

            const expandBtn = screen.getByRole('button', { name: /Expand incident details/i });
            fireEvent.click(expandBtn);

            expect(dialog).toHaveClass('max-sm:h-[88dvh]');

            // Pressing Escape while expanded collapses to peek state first
            fireEvent.keyDown(window, { key: 'Escape' });
            expect(dialog).toHaveClass('max-sm:h-[38dvh]');
            expect(onClose).not.toHaveBeenCalled();

            // Pressing Escape while collapsed calls onClose
            fireEvent.keyDown(window, { key: 'Escape' });
            expect(onClose).toHaveBeenCalledTimes(1);

            unmount();
            restoreMatchMedia();
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
            expect(screen.getAllByText(/severe/i).length).toBeGreaterThanOrEqual(1);
            expect(screen.getByText('verified')).toBeInTheDocument();

            // 2. Location in Overview (Barangay & Municipality, no coordinates for guest)
            expect(screen.getByText('Poblacion')).toBeInTheDocument();
            expect(screen.getByText('San Fernando')).toBeInTheDocument();
            expect(screen.queryByText(/Exact coordinates/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/GPS:/i)).not.toBeInTheDocument();

            // 3. Responding Agency & Time
            expect(screen.getByText(/PNP - San Fernando/i)).toBeInTheDocument();

            // 4. Description
            expect(screen.getByText(/Two motorcycles collided at the junction/i)).toBeInTheDocument();

            // 5. Casualties in 3-column grid
            expect(screen.getByText('Injured')).toBeInTheDocument();
            expect(screen.getByText('2')).toBeInTheDocument();
            expect(screen.getByText('Fatalities')).toBeInTheDocument();
            expect(screen.getByText('Missing')).toBeInTheDocument();

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

            // Thumbnail displays Protected badge and truthful title
            expect(screen.getByText('Protected')).toBeInTheDocument();
            expect(screen.queryByText(/Faces blurred for privacy/i)).not.toBeInTheDocument();

            // Click thumbnail to open lightbox
            const thumbnailBtn = screen.getByRole('button', { name: /Incident evidence photo 1/i });
            expect(thumbnailBtn).toHaveAttribute('title', expect.stringContaining('Privacy-safe preview'));
            fireEvent.click(thumbnailBtn);

            // Lightbox renders truthful title and footer badge
            expect(screen.getByText('Evidence photo preview')).toBeInTheDocument();
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

        test('renders status filter tabs and allows selecting filters', () => {
            render(
                <MemoryRouter>
                    <DashboardMapWorkspace {...workspaceProps} />
                </MemoryRouter>
            );

            const tablist = screen.getByRole('group', { name: 'Map status filter' });
            expect(tablist).toBeInTheDocument();
            // Guests now get the reporter's folded rail: a single Active
            // Incidents tab instead of Verified / Responding / Transferred
            // jargon, and no pending tab, which they are never sent data for.
            expect(within(tablist).getByRole('button', { name: /Active Incidents filter/i })).toBeInTheDocument();
            expect(within(tablist).queryByRole('button', { name: /Verified filter/i })).not.toBeInTheDocument();
            expect(within(tablist).queryByRole('button', { name: /Pending filter/i })).not.toBeInTheDocument();

            // The archive is not a status: it sits in the labeled layer group the
            // signed-in rail also uses, so a guest learns one rail, not two.
            const resolvedFilterBtn = within(tablist).getByRole('button', { name: /Resolved archive/i });
            expect(resolvedFilterBtn).toBeInTheDocument();

            fireEvent.click(resolvedFilterBtn);
            expect(workspaceProps.setResponderMapFilter).toHaveBeenCalledWith('resolved');
        });

        test('draws the selected rail tab with its own indicator instead of a border', () => {
            render(
                <MemoryRouter>
                    <DashboardMapWorkspace {...workspaceProps} />
                </MemoryRouter>
            );

            const tablist = screen.getByRole('group', { name: 'Map status filter' });
            const selectedTab = within(tablist).getByRole('button', { name: /Active Incidents filter/i });
            const unselectedTab = within(tablist).getByRole('button', { name: /Resolved archive/i });

            expect(selectedTab).toHaveAttribute('aria-pressed', 'true');
            expect(unselectedTab).toHaveAttribute('aria-pressed', 'false');

            // The indicator is a painted bar inside the tab. It cannot be a
            // `border-b-2` underline: the base stylesheet forces every button's
            // border-color transparent, which is how the selected tab used to
            // render identically to the two beside it.
            const indicatorOf = (tab) => tab.lastElementChild;
            expect(indicatorOf(selectedTab)).toHaveClass('h-[2px]');
            expect(indicatorOf(selectedTab).className).not.toContain('bg-transparent');
            expect(indicatorOf(unselectedTab)).toHaveClass('bg-transparent');
            expect(selectedTab.className).not.toContain('border-b-2');
            expect(unselectedTab.className).not.toContain('border-b-2');
        });

        test('renders 3 slim overview items with aligned values, chevrons, and accessible button semantics', () => {
            render(
                <MemoryRouter>
                    <DashboardMapWorkspace {...workspaceProps} />
                </MemoryRouter>
            );

            const summaryRegion = screen.getByRole('region', { name: 'Map summary' });
            expect(summaryRegion).toBeInTheDocument();

            const buttons = within(summaryRegion).getAllByRole('button');
            expect(buttons).toHaveLength(3);
            buttons.forEach((btn) => {
                expect(btn).toHaveAttribute('type', 'button');
                expect(btn).toHaveAttribute('aria-controls', 'dashboard-map-summary-panel');
                expect(btn).toHaveAttribute('aria-pressed');
                expect(btn).toHaveAttribute('aria-expanded');
                expect(btn).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-inset');
            });

            // Verify the 3 labeled actions exist with full text (mobile slim
            // row + desktop card render the label, so duplicates are expected)
            expect(within(summaryRegion).getAllByText('Active incidents').length).toBeGreaterThanOrEqual(1);
            expect(within(summaryRegion).getAllByText('Resolved').length).toBeGreaterThanOrEqual(1);
            expect(within(summaryRegion).getAllByText('Risk zones').length).toBeGreaterThanOrEqual(1);

            // Transferred is a status folded into active incidents, so it must
            // not reappear as a category card of its own.
            expect(within(summaryRegion).queryByText('Transferred')).not.toBeInTheDocument();
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
            expect(setMapSummaryPanel).toHaveBeenCalledWith('overview:active');

            fireEvent.click(riskZonesBtn);
            expect(setMapSummaryPanel).toHaveBeenCalledWith('overview:risk-zones');

            // Rerender with active panel to verify visual and accessibility selected state
            rerender(
                <MemoryRouter>
                    <DashboardMapWorkspace
                        {...workspaceProps}
                        setMapSummaryPanel={setMapSummaryPanel}
                        mapSummaryPanel="overview:active"
                    />
                </MemoryRouter>
            );

            // Scoped to the card stack: the pane now opens inside the summary
            // column — in the box those cards were standing in — so the region
            // also holds whatever the open pane says about active incidents.
            const updatedActiveBtn = within(screen.getByTestId('map-summary-cards')).getByRole('button', { name: /Active incidents/i });
            expect(updatedActiveBtn).toHaveAttribute('aria-pressed', 'true');
            expect(updatedActiveBtn).toHaveAttribute('aria-expanded', 'true');
        });

        test('overview metric labels stay on one line and are never clipped', () => {
            render(
                <MemoryRouter>
                    <DashboardMapWorkspace {...workspaceProps} />
                </MemoryRouter>
            );

            const summaryRegion = screen.getByRole('region', { name: 'Map summary' });
            const buttons = within(summaryRegion).getAllByRole('button');

            buttons.forEach((btn) => {
                // Two label spans per card: the mobile slim row clips on
                // purpose, the desktop card label is the one that must never
                // clip.
                const labelSpans = Array.from(btn.querySelectorAll('span.uppercase'));
                expect(labelSpans.length).toBeGreaterThanOrEqual(2);
                expect(labelSpans.some((span) => span.className.includes('truncate'))).toBe(true);
                const labelSpan = labelSpans.find((span) => !span.className.includes('truncate'));
                expect(labelSpan).toBeTruthy();
                // The desktop label wraps to a second line rather than being
                // clipped, and is not forced onto one line either — a nowrap
                // label overflowed its box and sat under the chevron.
                expect(labelSpan.className).toContain('leading-snug');
                expect(labelSpan.className).not.toContain('whitespace-nowrap');

                // Helper text must also wrap cleanly without single-line clipping
                const helperP = btn.querySelector('p.text-gray-500, p.text-gray-400');
                if (helperP) {
                    expect(helperP.className).toContain('break-words');
                    expect(helperP.className).not.toContain('truncate');
                }

                // The metric strip cards print their helper on a span instead.
                // The active-incidents line carries the responding / waiting /
                // transferred mix and can need a second line, so it wraps: a
                // single-line clip would drop the count it exists to show.
                const helperSpans = Array.from(btn.querySelectorAll('span.text-\\[11px\\]'))
                    .filter((span) => !span.className.includes('uppercase'));
                expect(helperSpans.length).toBeGreaterThanOrEqual(2);
                helperSpans.forEach((helperSpan) => {
                    expect(helperSpan.className).not.toContain('truncate');
                    expect(helperSpan.className).toContain('line-clamp-2');
                });
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
            expect(screen.queryByText(/No casualties recorded/i)).not.toBeInTheDocument();
            const zeroMetrics = screen.getAllByText('0');
            expect(zeroMetrics.length).toBe(3); // Injured, Fatalities, Missing
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
            const restoreMatchMedia = mockMobileViewport();
            const onClose = vi.fn();
            const { unmount } = render(
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
            expect(dialog).toHaveClass('max-sm:h-[38dvh]');

            const scrollRegion = screen.getByTestId('map-overlay-scroll-region');
            expect(scrollRegion).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto', 'overscroll-contain');

            // Header is fixed at top
            const header = dialog.querySelector('header');
            expect(header).toHaveClass('shrink-0', 'max-sm:cursor-pointer');

            // Tap header to expand
            fireEvent.click(header);
            expect(dialog).toHaveClass('max-sm:h-[88dvh]', 'max-sm:max-h-[calc(100dvh-env(safe-area-inset-top)-0.5rem)]');

            // All incident sections are accessible
            expect(screen.getByText('Bridge Obstruction in Cajidiocan')).toBeInTheDocument();
            expect(screen.getByText('Fallen tree blocking both lanes near bridge approach.')).toBeInTheDocument();
            expect(screen.getByText('MDRRMO - Cajidiocan')).toBeInTheDocument();
            expect(screen.getByText(/Original evidence is available only to the report owner/i)).toBeInTheDocument();

            // Swipe down collapses to peek
            fireEvent.touchStart(header, { touches: [{ clientY: 100 }] });
            fireEvent.touchEnd(header, { changedTouches: [{ clientY: 160 }] });
            expect(dialog).toHaveClass('max-sm:h-[38dvh]');
            expect(onClose).not.toHaveBeenCalled();

            // Swipe down from peek closes sheet
            fireEvent.touchStart(header, { touches: [{ clientY: 200 }] });
            fireEvent.touchEnd(header, { changedTouches: [{ clientY: 260 }] });
            expect(onClose).toHaveBeenCalledTimes(1);

            unmount();
            restoreMatchMedia();
        });
    });
});
