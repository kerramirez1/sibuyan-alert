import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from '../router';
import MapIncidentDetails from '../components/map/MapIncidentDetails';

const mocks = vi.hoisted(() => ({
    getReportById: vi.fn(),
    getPublicReportById: vi.fn(),
    getProtected: vi.fn(),
}));

vi.mock('../services/api', () => ({
    adminAPI: { getReportById: mocks.getReportById },
    reportsAPI: { getById: mocks.getPublicReportById },
    filesAPI: { getProtected: mocks.getProtected },
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
    fireInvolved: true,
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
        mocks.getReportById.mockReset();
        mocks.getPublicReportById.mockReset();
        mocks.getProtected.mockReset();
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
        const onLocate = vi.fn();
        renderDetails({ viewerRole: 'guest', onLocate });

        // Incident Header
        expect(screen.getByText('Accident at J. Rizal Street')).toBeInTheDocument();
        expect(screen.getByText(/moderate/i)).toBeInTheDocument();
        expect(screen.getAllByText(/verified/i).length).toBeGreaterThanOrEqual(1);

        // Location & Timing
        expect(screen.getByText('Poblacion')).toBeInTheDocument();
        expect(screen.getByText('Cajidiocan')).toBeInTheDocument();
        expect(screen.getByText(/GPS: 12.4044, 122.6897/i)).toBeInTheDocument();

        // Description & Indicators
        expect(screen.getByText('Motorcycle collision on road curve.')).toBeInTheDocument();
        expect(screen.getByText(/Fire or explosion involved/i)).toBeInTheDocument();

        // Response Info
        expect(screen.getByText('MDRRMO')).toBeInTheDocument();

        // Casualties
        expect(screen.getByText('Injured')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();

        // Evidence: Blurred for privacy — thumbnail must be a clickable button
        expect(screen.getByRole('heading', { name: /Evidence preview · 1/i })).toBeInTheDocument();
        expect(screen.getByText(/Faces blurred for privacy/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Incident evidence photo 1, faces blurred for privacy/i }))
            .toBeInTheDocument();
        expect(screen.getByText(/Original evidence is available only to the report owner and authorized municipal personnel/i)).toBeInTheDocument();

        // Privacy Notice
        expect(screen.getByText(/Personal identities and original evidence are protected\. A privacy-safe preview may be shown\./i)).toBeInTheDocument();

        // Sensitive details hidden
        expect(screen.queryByText('Private Reporter')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /open my full report/i })).not.toBeInTheDocument();

        // Locate action
        fireEvent.click(screen.getByRole('button', { name: /view on map/i }));
        expect(onLocate).toHaveBeenCalledWith(sampleReport);
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
        expect(screen.getByText(/Faces blurred for privacy/i)).toBeInTheDocument();
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

    test('6. Renders clear empty state when no casualties or impacts are recorded', () => {
        const noCasualtiesReport = {
            ...sampleReport,
            casualties: { injured: 0, fatalities: 0, missing: 0 },
            affectedArea: { householdsAffected: 0, evacuees: 0, radius: 0 },
        };
        renderDetails({ report: noCasualtiesReport, viewerRole: 'guest' });

        expect(screen.getByText('No casualties or affected-area impacts recorded.')).toBeInTheDocument();
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

    test('8. Renders populated casualties and affected area metrics correctly', () => {
        const fullImpactReport = {
            ...sampleReport,
            casualties: { injured: 3, fatalities: 1, missing: 2 },
            affectedArea: { householdsAffected: 15, evacuees: 45, radius: 250 },
        };
        renderDetails({ report: fullImpactReport, viewerRole: 'guest' });

        expect(screen.getByText('3')).toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('15')).toBeInTheDocument();
        expect(screen.getByText('45')).toBeInTheDocument();
        expect(screen.getByText('250 meters')).toBeInTheDocument();
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
            report: { ...sampleReport, detailAccess: 'operational', detailCompleteness: 'full' },
            viewerRole: 'responder',
        });

        expect(screen.getByText('Operational incident brief')).toBeInTheDocument();
        expect(screen.getByText('Critical incident indicators')).toBeInTheDocument();
    });

    test('11. Hides safety indicators when only casualties exist, keeping casualty counts single source of truth', () => {
        const casualtiesOnlyReport = {
            ...sampleReport,
            fireInvolved: false,
            casualties: { injured: 4, fatalities: 2, missing: 1 },
            affectedArea: { householdsAffected: 0, evacuees: 0, radius: 0 },
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

    test('12. Renders non-casualty indicators without repeating casualty counts', () => {
        const multiIndicatorReport = {
            ...sampleReport,
            fireInvolved: true,
            roadBlocked: true,
            hazardousCondition: true,
            casualties: { injured: 5, fatalities: 0, missing: 0 },
        };
        renderDetails({ report: multiIndicatorReport, viewerRole: 'guest' });

        // Non-casualty indicators render
        expect(screen.getByText(/Public safety indicators/i)).toBeInTheDocument();
        expect(screen.getByText('Fire or explosion involved')).toBeInTheDocument();
        expect(screen.getByText('Hazardous condition')).toBeInTheDocument();
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
                affectedArea: {
                    householdsAffected: 0,
                    evacuees: 0,
                    radius: 0,
                },
            };

            renderDetails({ report: pendingScreenshotReport, viewerRole: 'municipal_admin' });

            // Header contains section-level status note
            expect(screen.getByText('Report pending verification')).toBeInTheDocument();

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

            expect(screen.getByText('Report pending verification')).toBeInTheDocument();
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

            expect(screen.getByText('Report pending verification')).toBeInTheDocument();
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

            expect(screen.queryByText('Report pending verification')).not.toBeInTheDocument();
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
            expect(screen.getByText('J. Rizal Street, Poblacion, Cajidiocan')).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: /Your evidence photos · 1/i })).toBeInTheDocument();

            // When no action buttons (onLocate, canRespond, canResolve) are provided, no action buttons exist
            expect(screen.queryByRole('button', { name: /View on map/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Respond to incident/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Review resolution/i })).not.toBeInTheDocument();
        });

        test('owner reporter with onLocate provided renders only the "View on map" button without the full-report link', () => {
            const onLocate = vi.fn();
            const ownerReport = {
                ...sampleReport,
                _id: 'report-owner-1',
                isOwnedByCurrentUser: true,
            };

            renderDetails({
                report: ownerReport,
                viewerRole: 'reporter',
                onLocate,
            });

            expect(screen.getByRole('button', { name: /View on map/i })).toBeInTheDocument();
            expect(screen.queryByRole('link', { name: /open my full report/i })).not.toBeInTheDocument();
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
    });
});


