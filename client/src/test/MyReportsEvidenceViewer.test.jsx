import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from '../router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import MyReportsPage from '../pages/MyReportsPage';
import { clearBlobCache } from '../utils/blobCache';

const mocks = vi.hoisted(() => ({
    callbacks: {},
    getMyReports: vi.fn(),
    addUpdate: vi.fn(),
    getProtected: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../context/SocketContext', () => ({
    useSocket: () => ({
        subscribe: (event, callback) => {
            mocks.callbacks[event] = callback;
            return vi.fn();
        },
    }),
}));

vi.mock('../services/api', () => ({
    reportsAPI: {
        getMyReports: mocks.getMyReports,
        addUpdate: mocks.addUpdate,
    },
    filesAPI: {
        getProtected: mocks.getProtected,
    },
}));

vi.mock('react-hot-toast', () => ({ default: mocks.toast }));

// The page delivers its own queued reports, so it needs the signed-in reporter.
vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        user: { _id: 'reporter-1', role: 'reporter', isVerified: true },
        canSubmitReports: () => true,
    }),
}));

describe('MyReports Evidence Inspection and Modal Experience', () => {
    beforeEach(() => {
        clearBlobCache();
        mocks.callbacks = {};
        mocks.getMyReports.mockReset();
        mocks.addUpdate.mockReset();
        mocks.getProtected.mockReset();
        mocks.toast.success.mockReset();
        mocks.toast.error.mockReset();

        mocks.getProtected.mockResolvedValue({
            data: new Blob(['raw-binary-image-data'], { type: 'image/jpeg' }),
        });
        globalThis.URL.createObjectURL = vi.fn((blob) => `blob:http://localhost/owner-asset-${blob ? 'valid' : 'empty'}`);
        globalThis.URL.revokeObjectURL = vi.fn();
    });

    const reportWithOwnerEvidence = {
        _id: 'report-ev-1',
        address: 'Poblacion national highway',
        municipalityName: 'San Fernando',
        description: 'Overturned motorcycle on the road shoulder.',
        incidentType: 'vehicular',
        incidentTime: '2026-08-20T08:00:00.000Z',
        createdAt: '2026-08-20T08:05:00.000Z',
        updatedAt: '2026-08-20T08:05:00.000Z',
        severity: 'severe',
        status: 'verified',
        isOwnedByCurrentUser: true,
        images: ['/api/files/607f1f77bcf86cd799439011/photo1.jpg', '/api/files/607f1f77bcf86cd799439011/photo2.jpg'],
        evidence: {
            evidenceCount: 2,
            count: 2,
            viewerAccess: 'original',
            accessLevel: 'original',
            items: [
                {
                    id: '0',
                    index: 0,
                    originalUrl: '/api/files/607f1f77bcf86cd799439011/photo1.jpg',
                    previewUrl: '/api/files/607f1f77bcf86cd799439011/photo1.jpg',
                    redactedPreviewUrl: '/api/reports/report-ev-1/evidence/0/preview?rv=1',
                    accessLevel: 'original',
                    alt: 'Incident evidence photo 1',
                    isOwner: true,
                },
                {
                    id: '1',
                    index: 1,
                    originalUrl: '/api/files/607f1f77bcf86cd799439011/photo2.jpg',
                    previewUrl: '/api/files/607f1f77bcf86cd799439011/photo2.jpg',
                    redactedPreviewUrl: '/api/reports/report-ev-1/evidence/1/preview?rv=1',
                    accessLevel: 'original',
                    alt: 'Incident evidence photo 2',
                    isOwner: true,
                },
            ],
        },
        reportUpdates: [],
        transferHistory: [],
        responders: [],
    };

    const renderPage = (entry = '/my-reports') => render(
        <MemoryRouter initialEntries={[entry]}>
            <MyReportsPage />
        </MemoryRouter>
    );

    test('1. Owner sees unblurred thumbnail with "Your upload" badge and opens original image in modal with "Owner access · Original evidence"', async () => {
        mocks.getMyReports.mockResolvedValue({ data: { data: [reportWithOwnerEvidence] } });

        renderPage();

        // 1. Expand the report dossier
        const locationBtn = await screen.findByText('Poblacion national highway');
        fireEvent.click(locationBtn);

        // 2. Evidence photos heading and thumbnails are displayed
        expect(await screen.findByText(/Evidence photos \(2\)/i)).toBeInTheDocument();
        
        // Wait for protected file fetch
        await waitFor(() => {
            expect(mocks.getProtected).toHaveBeenCalledWith('/api/files/607f1f77bcf86cd799439011/photo1.jpg', expect.any(Object));
        });

        const ownerBadges = screen.getAllByText('Your upload');
        expect(ownerBadges.length).toBeGreaterThanOrEqual(1);

        // 3. Click the first evidence thumbnail to open the modal
        const thumbnailButtons = screen.getAllByRole('button', { name: /evidence photo 1/i });
        fireEvent.click(thumbnailButtons[0]);

        // 4. Modal opens and displays the original photo with Owner access badge
        const dialog = await screen.findByRole('dialog', { name: /Enlarged evidence image viewer/i });
        expect(dialog).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Evidence photo 1 of 2/i })).toBeInTheDocument();

        // Check authoritative owner label
        expect(screen.getByText('Owner access · Original evidence')).toBeInTheDocument();

        // Check that NO security violation or misleading error is rendered
        expect(screen.queryByText('Original evidence is protected.')).not.toBeInTheDocument();
        expect(screen.queryByText('Faces redacted for privacy · Scene details preserved')).not.toBeInTheDocument();

        // Check image rendering in modal
        const modalImg = screen.getAllByRole('img', { name: /Incident evidence photo 1/i });
        expect(modalImg.length).toBeGreaterThanOrEqual(1);

        // 5. Navigate to photo 2
        const nextButton = screen.getAllByRole('button', { name: /Next evidence photo/i })[0];
        fireEvent.click(nextButton);

        expect(screen.getByRole('heading', { name: /Evidence photo 2 of 2/i })).toBeInTheDocument();
        expect(screen.getByText('Owner access · Original evidence')).toBeInTheDocument();

        // 6. Close modal with close button
        const closeBtn = screen.getByRole('button', { name: /Close image viewer/i });
        fireEvent.click(closeBtn);

        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: /Enlarged evidence image viewer/i })).not.toBeInTheDocument();
        });
    });

    test('2. Allows retrying thumbnail loading when network error occurs', async () => {
        mocks.getProtected.mockRejectedValueOnce(new Error('Network error'));
        mocks.getMyReports.mockResolvedValue({ data: { data: [reportWithOwnerEvidence] } });

        renderPage();

        const locationBtn = await screen.findByText('Poblacion national highway');
        fireEvent.click(locationBtn);

        // Shows error in thumbnail
        expect(await screen.findByText('Evidence preview unavailable')).toBeInTheDocument();
        const retryBtn = screen.getByRole('button', { name: /Retry/i });
        expect(retryBtn).toBeInTheDocument();

        // Successful fetch on retry
        mocks.getProtected.mockResolvedValueOnce({
            data: new Blob(['retry-raw-bytes'], { type: 'image/jpeg' }),
        });
        fireEvent.click(retryBtn);

        await waitFor(() => {
            expect(screen.getByText('Your upload')).toBeInTheDocument();
        });
    });

    test('3. Compact spacing in expanded dossier and preserved situation update workflow', async () => {
        mocks.getMyReports.mockResolvedValue({ data: { data: [reportWithOwnerEvidence] } });

        renderPage();

        const locationBtn = await screen.findByText('Poblacion national highway');
        fireEvent.click(locationBtn);

        // Check all key facts, description, operational state, evidence gallery, and update button are present
        expect(screen.getByText('Overturned motorcycle on the road shoulder.')).toBeInTheDocument();
        expect(screen.getByText('Incident date')).toBeInTheDocument();
        expect(screen.getByText('Incident type')).toBeInTheDocument();
        expect(screen.getByText('Coordinates')).toBeInTheDocument();
        expect(screen.getByText('Report views')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Send situation update/i })).toBeInTheDocument();
    });

    test('4. Stacked evidence deck renders multi-photo counter badge (+N) and fanned card layers', async () => {
        mocks.getMyReports.mockResolvedValue({ data: { data: [reportWithOwnerEvidence] } });

        renderPage();

        const locationBtn = await screen.findByText('Poblacion national highway');
        fireEvent.click(locationBtn);

        // In stacked deck mode, a primary deck button is rendered with +1 counter badge for 2 photos
        const deckButton = await screen.findByRole('button', { name: /evidence photo 1/i });
        expect(deckButton).toBeInTheDocument();
        expect(screen.getByText('+1')).toBeInTheDocument();
        expect(screen.getByText('Your upload')).toBeInTheDocument();

        const img = within(deckButton).getByRole('img');
        expect(img.className).toContain('object-cover');
    });

    test('5. Non-owner / redacted evidence renders privacy-safe preview in stacked deck without leaking original URL', async () => {
        const reportWithRedactedEvidence = {
            ...reportWithOwnerEvidence,
            _id: 'report-redacted-1',
            isOwnedByCurrentUser: false,
            images: [],
            evidence: {
                count: 1,
                viewerAccess: 'redacted',
                items: [
                    {
                        id: '0',
                        index: 0,
                        redactedPreviewUrl: '/api/reports/report-redacted-1/evidence/0/preview',
                        accessLevel: 'redacted',
                        redactionType: 'privacy_preview',
                        alt: 'Incident evidence photo 1, privacy-safe preview',
                        isOwner: false,
                    },
                ],
            },
        };

        mocks.getMyReports.mockResolvedValue({ data: { data: [reportWithRedactedEvidence] } });

        renderPage();

        const locationBtn = await screen.findByText('Poblacion national highway');
        fireEvent.click(locationBtn);

        const redactedBtn = await screen.findByRole('button', { name: /faces blurred for privacy/i });
        expect(redactedBtn).toBeInTheDocument();

        const redactedImg = within(redactedBtn).getByRole('img');
        expect(redactedImg).toHaveAttribute('src', '/api/reports/report-redacted-1/evidence/0/preview');
        expect(redactedImg.className).toContain('object-cover');

        // Clicking redacted thumbnail opens modal in redacted mode
        expect(screen.getByText('Protected')).toBeInTheDocument();
        fireEvent.click(redactedBtn);
        const dialog = await screen.findByRole('dialog', { name: /Enlarged evidence image viewer/i });
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).getByText(/Privacy-safe preview/i)).toBeInTheDocument();
    });
});
