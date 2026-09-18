import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from '../router';
import MapIncidentDetails from '../components/map/MapIncidentDetails';
import { clearBlobCache } from '../utils/blobCache';

const mocks = vi.hoisted(() => ({
    getReportById: vi.fn(),
    getPublicReportById: vi.fn(),
    getProtected: vi.fn(),
    recordViewEvent: vi.fn(() => Promise.resolve({ data: { data: { counted: true } } })),
}));

vi.mock('../services/api', () => ({
    adminAPI: { getReportById: mocks.getReportById },
    reportsAPI: { getById: mocks.getPublicReportById },
    filesAPI: { getProtected: mocks.getProtected },
    // Mounting this sheet IS a reach view, so the mock has to expose the recorder
    // the hook imports. Leaving it out is how a dead reach call stayed green here.
    viewsAPI: { recordViewEvent: mocks.recordViewEvent },
}));

const sampleReport = {
    _id: 'report-1',
    title: 'Accident at J. Rizal Street',
    incidentType: 'motorcycle',
    status: 'verified',
    severity: 'moderate',
    address: 'J. Rizal Street',
    barangay: 'Poblacion',
    municipalityName: 'Cajidiocan',
    incidentTime: '2026-08-01T02:00:00Z',
    createdAt: '2026-08-01T02:05:00Z',
    updatedAt: '2026-08-01T03:00:00Z',
    description: 'Motorcycle collision on road curve.',
    coordinates: { lat: 12.4044, lng: 122.6897 },
    casualties: { injured: 2, fatalities: 0, missing: 0 },
    respondingAgencies: ['MDRRMO'],
    reporter: { name: 'Private Reporter', email: 'private@example.com' },
    evidenceCount: 1,
    evidence: {
        viewerAccess: 'redacted',
        accessLevel: 'redacted',
        count: 1,
        items: [
            {
                id: '0',
                index: 0,
                redactedPreviewUrl: '/api/reports/report-1/evidence/0/preview',
                previewUrl: '/api/reports/report-1/evidence/0/preview',
                alt: 'Blurred evidence preview',
                accessLevel: 'redacted',
                detectionStatus: 'faces_detected',
                redactionType: 'face_blur',
            },
        ],
    },
};

const renderDetails = (props = {}) => render(
    <MemoryRouter initialEntries={['/dashboard?view=map']}>
        <MapIncidentDetails report={sampleReport} {...props} />
    </MemoryRouter>,
);

describe('MapIncidentDetails Component in Map Dashboard', () => {
    beforeEach(() => {
        clearBlobCache();
        mocks.getReportById.mockReset();
        mocks.getPublicReportById.mockReset();
        mocks.getProtected.mockReset();
        // Views accumulate across tests in this file otherwise, which would make
        // "records exactly one view" unassertable.
        mocks.recordViewEvent.mockClear();
        mocks.getReportById.mockResolvedValue({
            data: {
                data: {
                    ...sampleReport,
                    images: ['/operational-evidence.jpg'],
                    evidence: {
                        viewerAccess: 'original',
                        accessLevel: 'original',
                        count: 1,
                        items: [{ id: '0', previewUrl: '/operational-evidence.jpg', originalUrl: '/operational-evidence.jpg', accessLevel: 'original' }],
                    },
                    detailAccess: 'operational',
                    detailCompleteness: 'full',
                },
            },
        });
        mocks.getPublicReportById.mockResolvedValue({
            data: {
                data: {
                    ...sampleReport,
                    detailCompleteness: 'full',
                },
            },
        });
    });

    test('1. Renders canonical structure and blurred evidence for guest users', async () => {
        renderDetails({ viewerRole: 'guest' });

        // Incident Header
        expect(screen.getByText('Accident at J. Rizal Street')).toBeInTheDocument();
        expect(screen.getAllByText(/moderate/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/verified/i).length).toBeGreaterThanOrEqual(1);

        // Overview section with 2-column metadata grid
        const overviewHeading = screen.getByRole('heading', { name: /Overview/i });
        expect(overviewHeading).toBeInTheDocument();
        expect(screen.getByText('Incident type')).toBeInTheDocument();
        expect(screen.getByText('Severity')).toBeInTheDocument();
        expect(screen.getByText('Incident time')).toBeInTheDocument();
        expect(screen.getByText('Submitted time')).toBeInTheDocument();
        expect(screen.getByText('Barangay')).toBeInTheDocument();
        expect(screen.getByText('Municipality')).toBeInTheDocument();
        expect(screen.getByText('Responding agency')).toBeInTheDocument();
        expect(screen.getByText('MDRRMO')).toBeInTheDocument();

        // Casualty summary inside Overview
        expect(screen.getByText('Casualty summary')).toBeInTheDocument();
        expect(screen.getByText('Injured')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();

        // Human-readable location in Overview
        expect(screen.getByText('Poblacion')).toBeInTheDocument();
        expect(screen.getByText('Cajidiocan')).toBeInTheDocument();

        // Exact coordinates, duplicate location row, and expandable accordion are NOT visible for guest
        expect(screen.queryByText(/Exact coordinates/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/12\.4044/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/GPS:/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/More incident information/i)).not.toBeInTheDocument();
        expect(screen.queryByText('J. Rizal Street, Poblacion, Cajidiocan')).not.toBeInTheDocument();

        // Description (no fire/disaster indicators in road-accident scope)
        expect(screen.getByText('Motorcycle collision on road curve.')).toBeInTheDocument();
        expect(screen.queryByText(/Fire or explosion involved/i)).not.toBeInTheDocument();

        // Evidence: Blurred for privacy — thumbnail must be a clickable button
        expect(screen.getByRole('heading', { name: /Evidence preview · 1/i })).toBeInTheDocument();
        expect(screen.getByText('Protected')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Incident evidence photo 1, faces blurred for privacy/i }))
            .toBeInTheDocument();
        expect(screen.getByText(/Original evidence is available only to the report owner and authorized municipal personnel/i)).toBeInTheDocument();

        // Privacy Notice
        expect(screen.getByText(/Personal identities and original evidence are protected\. A privacy-safe preview may be shown\./i)).toBeInTheDocument();

        // Sensitive details hidden and no redundant map/report actions
        expect(screen.queryByText('Private Reporter')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /open my full report/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /view on map/i })).not.toBeInTheDocument();
    });

    test('2. Renders original evidence and full-report deep link for report owner', async () => {
        const ownerReport = {
            ...sampleReport,
            isOwnedByCurrentUser: true,
            images: ['/api/files/my-evidence.jpg'],
            evidence: {
                viewerAccess: 'original',
                accessLevel: 'original',
                count: 1,
                items: [{ id: '0', previewUrl: '/api/files/my-evidence.jpg', originalUrl: '/api/files/my-evidence.jpg', accessLevel: 'original', isOwner: true }],
            },
        };
        mocks.getPublicReportById.mockResolvedValue({
            data: {
                data: {
                    ...ownerReport,
                    detailAccess: 'owner',
                    detailCompleteness: 'full',
                },
            },
        });

        renderDetails({
            viewerRole: 'reporter',
            report: ownerReport,
        });

        expect(screen.queryByRole('link', { name: /open my full report/i })).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Your evidence photos · 1/i })).toBeInTheDocument();
        expect(screen.getByText(/Sensitive responder identities and internal coordination details are protected\./i)).toBeInTheDocument();
    });

    test('3. Renders blurred evidence for non-owner authenticated reporter', async () => {
        renderDetails({
            viewerRole: 'reporter',
            report: { ...sampleReport, isOwnedByCurrentUser: false },
        });

        expect(screen.getByRole('heading', { name: /Evidence preview · 1/i })).toBeInTheDocument();
        expect(screen.getByText('Protected')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /open my full report/i })).not.toBeInTheDocument();
    });

    test('4. Renders operational unblurred evidence and capability-based actions for responder', async () => {
        const onRespond = vi.fn();
        const fullReport = {
            ...sampleReport,
            detailAccess: 'operational',
            detailCompleteness: 'full',
            evidence: {
                viewerAccess: 'original',
                count: 1,
                items: [{ id: '0', originalUrl: '/api/files/full-evidence.jpg', previewUrl: '/api/files/full-evidence.jpg', accessLevel: 'original' }],
            },
        };
        renderDetails({
            report: fullReport,
            viewerRole: 'responder',
            canRespond: true,
            onRespond,
        });

        expect(screen.getByRole('heading', { name: /Evidence photos · 1/i })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /respond to incident/i }));
        expect(onRespond).toHaveBeenCalledWith(fullReport);
    });


    test('5. Renders clear empty state when report has no evidence', () => {
        const noEvidenceReport = {
            ...sampleReport,
            evidenceCount: 0,
            evidence: { count: 0, items: [] },
            images: [],
        };
        renderDetails({ report: noEvidenceReport, viewerRole: 'guest' });

        expect(screen.getByText('No evidence attached.')).toBeInTheDocument();
    });

    test('6. Renders clear zero values in 3-column casualties grid without placeholder text', () => {
        const noCasualtiesReport = {
            ...sampleReport,
            casualties: { injured: 0, fatalities: 0, missing: 0 },
        };
        renderDetails({ report: noCasualtiesReport, viewerRole: 'guest' });

        const zeros = screen.getAllByText('0');
        expect(zeros.length).toBe(3); // Injured, Fatalities, Missing
        expect(screen.queryByText(/No casualties recorded/i)).not.toBeInTheDocument();
    });

    test('7. Renders error alert with retry button when loading fails', async () => {
        mocks.getPublicReportById.mockRejectedValue(new Error('Network disconnected'));

        renderDetails({
            report: { _id: 'report-fail', detailCompleteness: 'summary' },
            viewerRole: 'guest',
        });

        expect(await screen.findByRole('alert')).toHaveTextContent(/Connection problem/i);
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    test('8. Renders populated casualties in 3-column grid', () => {
        const fullImpactReport = {
            ...sampleReport,
            casualties: { injured: 3, fatalities: 1, missing: 2 },
        };
        renderDetails({ report: fullImpactReport, viewerRole: 'guest' });

        expect(screen.getByText('3')).toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.queryByText('Households')).not.toBeInTheDocument();
        expect(screen.queryByText('Evacuees')).not.toBeInTheDocument();
        expect(screen.queryByText('Affected radius')).not.toBeInTheDocument();
    });

    test('9. Handles long incident titles and missing descriptions gracefully', () => {
        const longReport = {
            ...sampleReport,
            title: 'Very Long Incident Title Involving Multiple Vehicles Along Provincial Road In Cajidiocan Romblon Island',
            description: '',
        };
        renderDetails({ report: longReport, viewerRole: 'guest' });

        expect(screen.getByText('Very Long Incident Title Involving Multiple Vehicles Along Provincial Road In Cajidiocan Romblon Island')).toBeInTheDocument();
        expect(screen.getByText(/No (incident )?description provided/i)).toBeInTheDocument();
    });

    test('10. Renders operational incident brief header for municipal responders', () => {
        renderDetails({
            report: { ...sampleReport, detailAccess: 'operational', detailCompleteness: 'full', roadBlocked: true },
            viewerRole: 'responder',
        });

        expect(screen.getByText('Incident brief')).toBeInTheDocument();
        expect(screen.getByText('Critical incident indicators')).toBeInTheDocument();
    });

    test('11. Hides safety indicators when only casualties exist, keeping casualty counts single source of truth', () => {
        const casualtiesOnlyReport = {
            ...sampleReport,
            casualties: { injured: 4, fatalities: 2, missing: 1 },
        };
        renderDetails({ report: casualtiesOnlyReport, viewerRole: 'guest' });

        // Safety indicator section must not render
        expect(screen.queryByText(/Public safety indicators/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Critical incident indicators/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/4 injured/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/2 fatalities/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/1 missing/i)).not.toBeInTheDocument();

        // Casualty counts render exactly once in the dedicated section
        expect(screen.getByText('Injured')).toBeInTheDocument();
        expect(screen.getByText('4')).toBeInTheDocument();
        expect(screen.getByText('Fatalities')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('Missing')).toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();
    });

    test('12. Renders road-blocked indicator without repeating casualty counts', () => {
        const multiIndicatorReport = {
            ...sampleReport,
            roadBlocked: true,
            casualties: { injured: 5, fatalities: 0, missing: 0 },
        };
        renderDetails({ report: multiIndicatorReport, viewerRole: 'guest' });

        // Non-casualty indicators render
        expect(screen.getByText(/Public safety indicators/i)).toBeInTheDocument();
        expect(screen.getByText('Road blocked')).toBeInTheDocument();

        // Casualty count is NOT inside safety indicators
        expect(screen.queryByText(/5 injured/i)).not.toBeInTheDocument();

        // Casualty count is in the dedicated section
        expect(screen.getByText('5')).toBeInTheDocument();
    });

    test('13. Clears open ImageViewer lightbox state when switching to another incident report', () => {
        const { rerender } = render(
            <MemoryRouter initialEntries={['/dashboard?view=map']}>
                <MapIncidentDetails report={sampleReport} viewerRole="guest" />
            </MemoryRouter>
        );

        // Open viewer on sampleReport
        const btn = screen.getByRole('button', { name: /Incident evidence photo 1, faces blurred for privacy/i });
        fireEvent.click(btn);
        expect(screen.getByRole('dialog', { name: /Enlarged evidence image viewer/i })).toBeInTheDocument();

        // Switch to a new incident report
        const newReport = {
            ...sampleReport,
            _id: 'report-2',
            title: 'Different Incident',
        };

        rerender(
            <MemoryRouter initialEntries={['/dashboard?view=map']}>
                <MapIncidentDetails report={newReport} viewerRole="guest" />
            </MemoryRouter>
        );

        // Viewer must be closed and not retain previous image state
        expect(screen.queryByRole('dialog', { name: /Enlarged evidence image viewer/i })).not.toBeInTheDocument();
    });

    describe('14. Privacy Notice Wording & Conditional Rendering', () => {
        test('renders accurate privacy notice for guest with privacy-safe preview', () => {
            const reportWithPreview = {
                ...sampleReport,
                updatedAt: '2026-08-25T10:00:00.000Z',
                evidence: {
                    count: 1,
                    viewerAccess: 'redacted',
                    items: [{ id: '0', redactedPreviewUrl: '/api/reports/1/evidence/0/preview' }],
                },
            };

            renderDetails({ report: reportWithPreview, viewerRole: 'guest' });

            expect(screen.getByText(/This is verified public safety information\. Personal identities and original evidence are protected\. A privacy-safe preview may be shown\./i)).toBeInTheDocument();
            expect(screen.getByText(/Last updated/i)).toBeInTheDocument();
            expect(screen.queryByText(/evidence are not displayed/i)).not.toBeInTheDocument();
        });

        test('renders accurate privacy notice for guest without evidence preview', () => {
            const reportWithoutEvidence = {
                ...sampleReport,
                updatedAt: '2026-08-25T10:00:00.000Z',
                evidenceCount: 0,
                evidence: { count: 0, items: [] },
                images: [],
            };

            renderDetails({ report: reportWithoutEvidence, viewerRole: 'guest' });

            expect(screen.getByText(/This is verified public safety information\. Personal identities, evidence, and internal coordination details are protected\./i)).toBeInTheDocument();
            expect(screen.getByText(/Last updated/i)).toBeInTheDocument();
            expect(screen.queryByText(/A privacy-safe preview may be shown/i)).not.toBeInTheDocument();
        });

        test('renders accurate privacy notice for report owner with original access', () => {
            const ownerReport = {
                ...sampleReport,
                isOwnedByCurrentUser: true,
                updatedAt: '2026-08-25T10:00:00.000Z',
                images: ['/api/files/photo.jpg'],
                evidence: {
                    viewerAccess: 'original',
                    count: 1,
                    items: [{ id: '0', originalUrl: '/api/files/photo.jpg', accessLevel: 'original' }],
                },
            };

            renderDetails({ report: ownerReport, viewerRole: 'reporter' });

            expect(screen.getByText(/This is verified public safety information\. Sensitive responder identities and internal coordination details are protected\./i)).toBeInTheDocument();
            expect(screen.getByText(/Last updated/i)).toBeInTheDocument();
        });

        test('renders operational privacy notice for responder and municipal admin', () => {
            const operationalReport = {
                ...sampleReport,
                detailAccess: 'operational',
                detailCompleteness: 'full',
            };

            const { unmount } = render(
                <MemoryRouter>
                    <MapIncidentDetails report={operationalReport} viewerRole="responder" />
                </MemoryRouter>
            );

            expect(screen.getByText(/This operational view contains protected incident information\. Access to original evidence and sensitive coordination details is restricted by role\./i)).toBeInTheDocument();
            unmount();

            render(
                <MemoryRouter>
                    <MapIncidentDetails report={operationalReport} viewerRole="municipal_admin" />
                </MemoryRouter>
            );

            expect(screen.getByText(/This operational view contains protected incident information\. Access to original evidence and sensitive coordination details is restricted by role\./i)).toBeInTheDocument();
        });

        test('gracefully handles missing timestamp without appending broken text', () => {
            const noTimestampReport = {
                ...sampleReport,
                updatedAt: null,
                verifiedAt: null,
                evidenceCount: 0,
                evidence: { count: 0, items: [] },
                images: [],
            };

            renderDetails({ report: noTimestampReport, viewerRole: 'guest' });

            const notice = screen.getByText(/This is verified public safety information\. Personal identities, evidence, and internal coordination details are protected\./i);
            expect(notice).toBeInTheDocument();
            expect(notice.textContent).not.toContain('Last updated');
        });
    });

    describe('15. Casualty Semantics and Separation of Verification Status', () => {
        test('pending report with { injured: 0, fatalities: 2, missing: 4 } renders exact numbers (screenshot scenario)', () => {
        const pendingScreenshotReport = {
            ...sampleReport,
            status: 'pending',
            casualties: {
                injured: 0,
                fatalities: 2,
                missing: 4,
            },
        };

            renderDetails({ report: pendingScreenshotReport, viewerRole: 'municipal_admin' });

            // Header contains top-level review status note
            expect(screen.getByText('Awaiting verification')).toBeInTheDocument();

            // Injured metric displays numeric 0, NOT "Pending verification"
            expect(screen.getByText('Injured')).toBeInTheDocument();
            expect(screen.getByText('0')).toBeInTheDocument();
            expect(screen.queryByText('Pending verification')).not.toBeInTheDocument();

            // Fatalities and Missing display exact counts
            expect(screen.getByText('Fatalities')).toBeInTheDocument();
            expect(screen.getByText('2')).toBeInTheDocument();

            expect(screen.getByText('Missing')).toBeInTheDocument();
            expect(screen.getByText('4')).toBeInTheDocument();
        });

        test('pending report with all zeros preserves 0s without replacing with status string', () => {
            const pendingZeroReport = {
                ...sampleReport,
                status: 'pending',
                casualties: {
                    injured: 0,
                    fatalities: 0,
                    missing: 0,
                },
            };

            renderDetails({ report: pendingZeroReport, viewerRole: 'responder' });

            expect(screen.getByText('Awaiting verification')).toBeInTheDocument();
            const zeroMetrics = screen.getAllByText('0');
            expect(zeroMetrics.length).toBe(3); // Injured, Fatalities, Missing
            expect(screen.queryByText('Pending verification')).not.toBeInTheDocument();
        });

        test('missing or null casualty fields render "Not recorded" cleanly', () => {
            const nullCasualtiesReport = {
                ...sampleReport,
                status: 'pending',
                casualties: {
                    injured: null,
                    fatalities: undefined,
                    missing: '',
                },
            };

            renderDetails({ report: nullCasualtiesReport, viewerRole: 'guest' });

            expect(screen.getByText('Awaiting verification')).toBeInTheDocument();
            const notRecordedMetrics = screen.getAllByText('Not recorded');
            expect(notRecordedMetrics.length).toBe(3);
        });

        test('invalid string casualty values normalize to "Not recorded"', () => {
            const invalidCasualtiesReport = {
                ...sampleReport,
                status: 'verified',
                casualties: {
                    injured: 'pending_check',
                    fatalities: -1,
                    missing: NaN,
                },
            };

            renderDetails({ report: invalidCasualtiesReport, viewerRole: 'guest' });

            expect(screen.queryByText('Awaiting verification')).not.toBeInTheDocument();
            const notRecordedMetrics = screen.getAllByText('Not recorded');
            expect(notRecordedMetrics.length).toBe(3);
        });
    });

    describe('16. Contextual Action Filtering for Report Owner on Map', () => {
        test('owner reporter on map does not see "Open my full report" and empty footer is collapsed', () => {
            const ownerReport = {
                ...sampleReport,
                _id: 'report-owner-1',
                id: 'report-owner-1',
                isOwnedByCurrentUser: true,
                evidence: {
                    viewerAccess: 'original',
                    count: 1,
                    items: [{ id: '0', previewUrl: '/api/files/photo.jpg', originalUrl: '/api/files/photo.jpg', accessLevel: 'original', isOwner: true }],
                },
                images: ['/api/files/photo.jpg'],
            };

            renderDetails({
                report: ownerReport,
                viewerRole: 'reporter',
            });

            // "Open my full report" link is absent
            expect(screen.queryByRole('link', { name: /open my full report/i })).not.toBeInTheDocument();

            // All valid map details remain accessible
            expect(screen.getByText('Poblacion')).toBeInTheDocument();
            expect(screen.getByText('Cajidiocan')).toBeInTheDocument();
            expect(screen.getByText('Exact coordinates')).toBeInTheDocument();
            expect(screen.getByText('12.404400, 122.689700')).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: /Your evidence photos · 1/i })).toBeInTheDocument();

            // When no action buttons (canRespond, canResolve) apply, no action footer exists
            expect(screen.queryByRole('button', { name: /View on map/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Respond to incident/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Review resolution/i })).not.toBeInTheDocument();
        });

        test('owner reporter viewing map incident details renders cleanly ending after privacy notice without "View on map" or "Open my full report"', () => {
            const ownerReport = {
                ...sampleReport,
                _id: 'report-owner-1',
                isOwnedByCurrentUser: true,
            };

            renderDetails({
                report: ownerReport,
                viewerRole: 'reporter',
            });

            expect(screen.queryByRole('button', { name: /View on map/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('link', { name: /open my full report/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Respond to incident/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Review resolution/i })).not.toBeInTheDocument();
        });

        test('responder and admin retain operational action capabilities', () => {
            const onRespond = vi.fn();
            const onResolve = vi.fn();

            renderDetails({
                report: sampleReport,
                viewerRole: 'responder',
                canRespond: true,
                canResolve: true,
                onRespond,
                onResolve,
            });

            expect(screen.getByRole('button', { name: /Respond to incident/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Review resolution/i })).toBeInTheDocument();
            expect(screen.queryByRole('link', { name: /open my full report/i })).not.toBeInTheDocument();
        });

        test('admin review actions appear for pending reports and call through', () => {
            const onVerify = vi.fn();
            const onReject = vi.fn();
            const pendingReport = { ...sampleReport, status: 'pending' };

            renderDetails({
                report: pendingReport,
                viewerRole: 'municipal_admin',
                canVerify: true,
                canReject: true,
                onVerify,
                onReject,
            });

            fireEvent.click(screen.getByRole('button', { name: /Verify report/i }));
            expect(onVerify).toHaveBeenCalledTimes(1);
            fireEvent.click(screen.getByRole('button', { name: /Reject report/i }));
            expect(onReject).toHaveBeenCalledTimes(1);
        });

        test('no review actions without admin verify capability', () => {
            renderDetails({
                report: { ...sampleReport, status: 'pending' },
                viewerRole: 'municipal_admin',
            });

            expect(screen.queryByRole('button', { name: /Verify report/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Reject report/i })).not.toBeInTheDocument();
        });
    });

    describe('17. Six-Decimal Coordinates, Location Cleanup & Accordion Removal', () => {
        test('renders exact coordinates with 6 decimal places inside Overview for responder', () => {
            renderDetails({
                report: sampleReport,
                viewerRole: 'responder',
            });

            expect(screen.getByText('Exact coordinates')).toBeInTheDocument();
            expect(screen.getByText('12.404400, 122.689700')).toBeInTheDocument();
        });

        test('renders exact coordinates with 6 decimal places inside Overview for municipal admin', () => {
            renderDetails({
                report: sampleReport,
                viewerRole: 'municipal_admin',
            });

            expect(screen.getByText('Exact coordinates')).toBeInTheDocument();
            expect(screen.getByText('12.404400, 122.689700')).toBeInTheDocument();
        });

        test('renders exact coordinates with 6 decimal places inside Overview for report owner', () => {
            renderDetails({
                report: { ...sampleReport, isOwnedByCurrentUser: true },
                viewerRole: 'reporter',
            });

            expect(screen.getByText('Exact coordinates')).toBeInTheDocument();
            expect(screen.getByText('12.404400, 122.689700')).toBeInTheDocument();
        });

        test('does NOT render exact coordinates for guest user', () => {
            renderDetails({
                report: sampleReport,
                viewerRole: 'guest',
            });

            expect(screen.queryByText(/Exact coordinates/i)).not.toBeInTheDocument();
            expect(screen.queryByText('12.404400, 122.689700')).not.toBeInTheDocument();
        });

        test('does NOT render exact coordinates for non-owner reporter', () => {
            renderDetails({
                report: { ...sampleReport, isOwnedByCurrentUser: false },
                viewerRole: 'reporter',
            });

            expect(screen.queryByText(/Exact coordinates/i)).not.toBeInTheDocument();
            expect(screen.queryByText('12.404400, 122.689700')).not.toBeInTheDocument();
        });

        test('duplicate location row under title and "More incident information" accordion are absent', () => {
            renderDetails({
                report: sampleReport,
                viewerRole: 'responder',
            });

            // No duplicate location row with full address
            expect(screen.queryByText('J. Rizal Street, Poblacion, Cajidiocan')).not.toBeInTheDocument();

            // No "More incident information" expandable accordion
            expect(screen.queryByText(/More incident information/i)).not.toBeInTheDocument();

            // Static privacy notice is present
            expect(screen.getByText(/This operational view contains protected incident information/i)).toBeInTheDocument();
        });

        test('casualty data appears only once inside Overview', () => {
            renderDetails({
                report: sampleReport,
                viewerRole: 'responder',
            });

            // "Casualty summary" heading rendered once
            const casualtyHeadings = screen.getAllByText('Casualty summary');
            expect(casualtyHeadings.length).toBe(1);

            // Injured metric appears once with count 2
            expect(screen.getByText('Injured')).toBeInTheDocument();
            expect(screen.getByText('2')).toBeInTheDocument();
        });

        test('incident type badge is removed from header and appears only inside Overview', () => {
            renderDetails({
                report: sampleReport,
                viewerRole: 'guest',
            });

            // Status and severity badges remain in header
            expect(screen.getByText('verified')).toBeInTheDocument();
            expect(screen.getByText('Moderate')).toBeInTheDocument();

            // Incident type appears in Overview metadata grid (label and value)
            expect(screen.getByText('Incident type')).toBeInTheDocument();
            const motorcycleElements = screen.getAllByText('Motorcycle');
            // Exactly 1 instance of 'Motorcycle' in the metadata grid (not duplicated in header badge)
            expect(motorcycleElements.length).toBe(1);
        });

        test('transferred report keeps physical municipality and shows target viewer transfer origin', () => {
            renderDetails({
                report: {
                    ...sampleReport,
                    status: 'transferred',
                    municipalityName: 'Magdiwang',
                    originalMunicipalityName: 'Cajidiocan',
                    transferHistory: [
                        {
                            fromMunicipalityName: 'Cajidiocan',
                            toMunicipalityName: 'Magdiwang',
                            reason: 'Mutual-aid response coverage',
                        },
                    ],
                },
                viewerRole: 'municipal_admin',
                viewer: { role: 'municipal_admin', assignedMunicipality: 'Magdiwang' },
            });

            expect(screen.getByText('Municipality')).toBeInTheDocument();
            expect(screen.getAllByText('Cajidiocan').length).toBeGreaterThanOrEqual(1);
            expect(screen.queryByText('Magdiwang')).not.toBeInTheDocument();
            expect(screen.getByText('Transferred from')).toBeInTheDocument();
        });

        test('transferred report shows origin viewer the destination municipality', () => {
            renderDetails({
                report: {
                    ...sampleReport,
                    status: 'transferred',
                    municipalityName: 'Magdiwang',
                    originalMunicipalityName: 'Cajidiocan',
                    transferHistory: [
                        {
                            fromMunicipalityName: 'Cajidiocan',
                            toMunicipalityName: 'Magdiwang',
                            reason: 'Mutual-aid response coverage',
                        },
                    ],
                },
                viewerRole: 'municipal_admin',
                viewer: { role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            });

            expect(screen.getByText('Municipality')).toBeInTheDocument();
            expect(screen.getByText('Transferred to')).toBeInTheDocument();
            expect(screen.getByText('Magdiwang')).toBeInTheDocument();
        });

        test('non-transferred report shows no transfer origin', () => {
            renderDetails({
                report: sampleReport,
                viewerRole: 'guest',
            });

            expect(screen.queryByText('Transferred from')).not.toBeInTheDocument();
            expect(screen.queryByText('Transferred to')).not.toBeInTheDocument();
        });

        test("reporter opening another reporter's pending sees the unverified notice", () => {
            renderDetails({
                report: {
                    ...sampleReport,
                    _id: 'report-pending-other',
                    status: 'pending',
                    isOwnedByCurrentUser: false,
                    reporter: { name: 'Someone Else' },
                },
                viewerRole: 'reporter',
                viewer: { _id: 'reporter-1', role: 'reporter' },
            });

            expect(screen.getByText(/unverified community report/i)).toBeInTheDocument();
            // No contact or identity leak for non-owned pending
            expect(screen.queryByText('private@example.com')).not.toBeInTheDocument();
            expect(screen.queryByText('Someone Else')).not.toBeInTheDocument();
        });
    });

    describe('15. Reach recording', () => {
        test('records one view for the incident it opens', async () => {
            renderDetails();

            // Mounting this sheet IS the view. It is the surface a member of the
            // public actually uses, so if this stops firing the panel's numbers
            // describe only the archive page and look plausible while doing it.
            await waitFor(() => expect(mocks.recordViewEvent).toHaveBeenCalledTimes(1));
            expect(mocks.recordViewEvent).toHaveBeenCalledWith({
                targetType: 'report',
                targetId: 'report-1',
            });
        });

        test('does not record a second view when the report object is replaced', async () => {
            const { rerender } = render(
                <MemoryRouter initialEntries={['/dashboard?view=map']}>
                    <MapIncidentDetails report={sampleReport} />
                </MemoryRouter>,
            );

            await waitFor(() => expect(mocks.recordViewEvent).toHaveBeenCalledTimes(1));

            rerender(
                <MemoryRouter initialEntries={['/dashboard?view=map']}>
                    <MapIncidentDetails report={{ ...sampleReport }} />
                </MemoryRouter>,
            );

            expect(mocks.recordViewEvent).toHaveBeenCalledTimes(1);
        });
    });
});


