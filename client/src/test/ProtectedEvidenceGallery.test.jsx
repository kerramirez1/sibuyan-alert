import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import ProtectedEvidenceGallery from '../components/report/ProtectedEvidenceGallery';
import { clearBlobCache } from '../utils/blobCache';

const mocks = vi.hoisted(() => ({
    getProtected: vi.fn(),
}));

vi.mock('../services/api', () => ({
    filesAPI: { getProtected: mocks.getProtected },
}));

describe('ProtectedEvidenceGallery Component', () => {
    beforeEach(() => {
        clearBlobCache();
        mocks.getProtected.mockReset();
        mocks.getProtected.mockResolvedValue({
            data: new Blob(['fake image data'], { type: 'image/jpeg' }),
        });
        globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/fake-image');
        globalThis.URL.revokeObjectURL = vi.fn();
    });

    test('1. Renders face-redacted preview with "Faces blurred for privacy" overlay for blurred access level', () => {
        const evidence = {
            count: 1,
            viewerAccess: 'redacted',
            items: [
                {
                    id: '0',
                    index: 0,
                    redactedPreviewUrl: '/api/reports/report-1/evidence/0/preview',
                    accessLevel: 'redacted',
                    redactionType: 'face_blur',
                    alt: 'Incident evidence photo 1, faces blurred for privacy',
                },
            ],
        };

        render(<ProtectedEvidenceGallery evidence={evidence} />);

        expect(screen.getByText('Protected')).toBeInTheDocument();
        // Blurred thumbnail must be a clickable button
        expect(screen.getByRole('button', { name: /Incident evidence photo 1, faces blurred for privacy/i }))
            .toBeInTheDocument();
        expect(screen.getByRole('img', { name: /Incident evidence photo 1, faces blurred for privacy/i }))
            .toHaveAttribute('src', '/api/reports/report-1/evidence/0/preview');
        expect(screen.getByText(/Original evidence is available only to the report owner and authorized municipal personnel/i))
            .toBeInTheDocument();
        expect(mocks.getProtected).not.toHaveBeenCalled();
    });

    test('2. Rejects protected /api/files/... URLs safely when in blurred mode', () => {
        const evidence = {
            count: 1,
            viewerAccess: 'redacted',
            items: [
                {
                    id: '0',
                    index: 0,
                    redactedPreviewUrl: '/api/files/607f1f77bcf86cd799439011/photo.jpg',
                    accessLevel: 'redacted',
                },
            ],
        };

        render(<ProtectedEvidenceGallery evidence={evidence} />);

        expect(mocks.getProtected).not.toHaveBeenCalled();
        expect(screen.getByText(/Original evidence is protected|Evidence preview unavailable/i)).toBeInTheDocument();
    });

    test('3. Fetches authenticated protected image for report owner and allows lightbox view', async () => {
        const evidence = {
            count: 1,
            viewerAccess: 'original',
            items: [
                {
                    id: '0',
                    index: 0,
                    originalUrl: '/api/files/607f1f77bcf86cd799439011/photo.jpg',
                    previewUrl: '/api/files/607f1f77bcf86cd799439011/photo.jpg',
                    accessLevel: 'original',
                    isOwner: true,
                },
            ],
        };

        render(<ProtectedEvidenceGallery evidence={evidence} accessLevel="original" isOwner={true} />);

        expect(await screen.findByText('Your upload')).toBeInTheDocument();
        expect(mocks.getProtected).toHaveBeenCalledWith(
            '/api/files/607f1f77bcf86cd799439011/photo.jpg',
            expect.objectContaining({ signal: expect.any(AbortSignal) })
        );

        fireEvent.click(screen.getByRole('button', { name: /View evidence photo 1/i }));
        expect(await screen.findByRole('button', { name: /Close image viewer/i })).toBeInTheDocument();
        const dialog = screen.getByRole('dialog', { name: /Enlarged evidence image viewer/i });
        const viewerImg = within(dialog).getByRole('img');
        expect(viewerImg).toHaveAttribute('src', 'blob:http://localhost/fake-image');
    });

    test('4. Renders "No evidence attached." empty state when evidence list is empty', () => {
        render(<ProtectedEvidenceGallery images={[]} evidence={{ count: 0, viewerAccess: 'none', items: [] }} />);

        expect(screen.getByText('No evidence attached.')).toBeInTheDocument();
    });

    test('5. Blurred thumbnail is a clickable button that opens ImageViewer with the blurred preview URL — never calls getProtected', async () => {
        const evidence = {
            count: 1,
            viewerAccess: 'redacted',
            items: [
                {
                    id: '0',
                    index: 0,
                    redactedPreviewUrl: '/api/reports/report-2/evidence/0/preview',
                    accessLevel: 'redacted',
                },
            ],
        };

        render(<ProtectedEvidenceGallery evidence={evidence} />);

        // The thumbnail must render as an interactive button
        const btn = screen.getByRole('button', { name: /Incident evidence photo 1, faces blurred for privacy/i });
        expect(btn).toBeInTheDocument();

        // Clicking opens the ImageViewer
        fireEvent.click(btn);
        expect(await screen.findByRole('button', { name: /Close image viewer/i })).toBeInTheDocument();

        // The viewer shows the blurred preview URL inside dialog — not the original GridFS URL
        const dialog = screen.getByRole('dialog', { name: /Enlarged evidence image viewer/i });
        const viewerImg = within(dialog).getByRole('img');
        expect(viewerImg).toHaveAttribute('src', '/api/reports/report-2/evidence/0/preview');

        // filesAPI.getProtected must never have been called (no original bytes requested)
        expect(mocks.getProtected).not.toHaveBeenCalled();
    });

    test('6. In redacted mode, missing redactedPreviewUrl renders safe unavailable state and NEVER falls back to original', () => {
        const evidence = {
            count: 1,
            viewerAccess: 'redacted',
            items: [
                {
                    id: '0',
                    index: 0,
                    redactedPreviewUrl: '',
                    originalUrl: '/api/files/607f1f77bcf86cd799439011/photo.jpg',
                    source: '/api/files/607f1f77bcf86cd799439011/photo.jpg',
                    accessLevel: 'redacted',
                },
            ],
        };

        render(
            <ProtectedEvidenceGallery
                evidence={evidence}
                images={['/api/files/607f1f77bcf86cd799439011/photo.jpg']}
            />
        );

        expect(mocks.getProtected).not.toHaveBeenCalled();
        expect(screen.getByText(/Original evidence is protected|Evidence preview unavailable/i)).toBeInTheDocument();
    });


    test('7. Client-side isOwner or props cannot elevate access when server says viewerAccess is redacted', () => {
        const evidence = {
            count: 1,
            viewerAccess: 'redacted',
            items: [
                {
                 id: '0',
                 index: 0,
                 redactedPreviewUrl: '/api/reports/report-3/evidence/0/preview',
                 isOwner: true,
                },
            ],
        };

        render(<ProtectedEvidenceGallery evidence={evidence} isOwner={true} />);

        // Must still render in redacted mode with privacy overlay
        expect(screen.getByText('Protected')).toBeInTheDocument();
        expect(mocks.getProtected).not.toHaveBeenCalled();
    });

    test('8. Shows appropriate badge for scene preview vs privacy fallback preview in gallery', () => {
        const evidence = {
            count: 2,
            viewerAccess: 'redacted',
            items: [
                {
                    id: '0',
                    index: 0,
                    redactedPreviewUrl: '/api/reports/report-1/evidence/0/preview',
                    detectionStatus: 'no_faces_detected',
                    redactionType: 'none',
                },
                {
                    id: '1',
                    index: 1,
                    redactedPreviewUrl: '/api/reports/report-1/evidence/1/preview',
                    detectionStatus: 'detector_failed',
                    redactionType: 'fallback_blur',
                },
            ],
        };

        render(<ProtectedEvidenceGallery evidence={evidence} />);

        const buttons = screen.getAllByRole('button');
        expect(buttons[0]).toHaveAttribute('title', expect.stringContaining('Scene preview'));
        expect(buttons[1]).toHaveAttribute('title', expect.stringContaining('Privacy preview'));
    });

    test('9. Renders compact variant with responsive thumbnail dimensions (180-220px desktop) and flex container', () => {
        const evidence = {
            count: 2,
            viewerAccess: 'redacted',
            items: [
                {
                    id: '0',
                    index: 0,
                    redactedPreviewUrl: '/api/reports/report-1/evidence/0/preview',
                },
                {
                    id: '1',
                    index: 1,
                    redactedPreviewUrl: '/api/reports/report-1/evidence/1/preview',
                },
            ],
        };

        const { container } = render(<ProtectedEvidenceGallery evidence={evidence} variant="compact" />);

        const flexContainer = container.querySelector('.flex.flex-wrap');
        expect(flexContainer).toBeInTheDocument();

        const buttons = screen.getAllByRole('button');
        buttons.forEach((btn) => {
            expect(btn.className).toContain('w-24');
            expect(btn.className).toContain('sm:w-28');
            expect(btn.className).toContain('shrink-0');
        });
    });

    test('10. Renders retry button in thumbnail on load error and allows reloading', async () => {
        mocks.getProtected.mockRejectedValueOnce(new Error('Network error'));

        const evidence = {
            count: 1,
            viewerAccess: 'original',
            items: [
                {
                    id: '0',
                    index: 0,
                    originalUrl: '/api/files/607f1f77bcf86cd799439011/photo.jpg',
                    accessLevel: 'original',
                    isOwner: true,
                },
            ],
        };

        render(<ProtectedEvidenceGallery evidence={evidence} accessLevel="original" isOwner={true} />);

        expect(await screen.findByText('Evidence preview unavailable')).toBeInTheDocument();
        const retryBtn = screen.getByRole('button', { name: /Retry/i });
        expect(retryBtn).toBeInTheDocument();

        mocks.getProtected.mockResolvedValueOnce({
            data: new Blob(['resolved-data'], { type: 'image/jpeg' }),
        });

        fireEvent.click(retryBtn);

        expect(await screen.findByText('Your upload')).toBeInTheDocument();
    });

    test('11. Renders stacked card deck (baraha) layout when variant="stacked" with multiple photos', async () => {
        const multiEvidence = {
            count: 3,
            viewerAccess: 'redacted',
            items: [
                { id: '0', index: 0, redactedPreviewUrl: '/api/reports/1/evidence/0/preview', redactionType: 'face_blur' },
                { id: '1', index: 1, redactedPreviewUrl: '/api/reports/1/evidence/1/preview', redactionType: 'face_blur' },
                { id: '2', index: 2, redactedPreviewUrl: '/api/reports/1/evidence/2/preview', redactionType: 'face_blur' },
            ],
        };

        const onViewImage = vi.fn();
        render(
            <ProtectedEvidenceGallery
                evidence={multiEvidence}
                variant="stacked"
                onViewImage={onViewImage}
            />
        );

        // Counter badge for +2 more photos
        expect(screen.getByText('+2')).toBeInTheDocument();
        expect(screen.getByText('Protected')).toBeInTheDocument();

        // Clicking the deck invokes onViewImage with first item and complete items array
        const deckButton = screen.getByRole('button', { name: /Incident evidence photo 1/i });
        fireEvent.click(deckButton);
        expect(onViewImage).toHaveBeenCalledWith(
            expect.objectContaining({ id: '0', index: 0, total: 3 }),
            0,
            expect.any(Array)
        );
    });
});

describe('ProtectedEvidenceGallery resolution labelVariant', () => {
    beforeEach(() => {
        clearBlobCache();
        mocks.getProtected.mockReset();
        mocks.getProtected.mockResolvedValue({
            data: new Blob(['fake image data'], { type: 'image/jpeg' }),
        });
        globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/fake-image');
        globalThis.URL.revokeObjectURL = vi.fn();
    });

    const resolutionProps = {
        images: ['/api/files/aaa/resolution-1.jpg', '/api/files/bbb/resolution-2.jpg'],
        accessLevel: 'original',
        isOperational: true,
        labelVariant: 'resolution',
    };

    test('labels thumbnails as resolution photos, not evidence', async () => {
        render(<ProtectedEvidenceGallery {...resolutionProps} />);

        // Item alt text carries the resolution identity.
        const thumbnails = await screen.findAllByAltText('Resolution photo 1');
        expect(thumbnails).toHaveLength(1);
        expect(screen.getByAltText('Resolution photo 2')).toBeInTheDocument();
        expect(screen.queryByAltText(/Incident evidence photo/)).not.toBeInTheDocument();
    });

    test('the viewer reads "Resolution photo N of M" with the resolution access badge', async () => {
        render(<ProtectedEvidenceGallery {...resolutionProps} />);

        fireEvent.click(await screen.findByRole('button', { name: /View resolution photo 1/i }));

        // ImageViewer renders in a portal: header + footer badge use the
        // resolution labeling instead of the "Original evidence" wording.
        expect(await screen.findByText('Resolution photo 1 of 2')).toBeInTheDocument();
        expect(screen.getByText('Resolution photo · Operational access')).toBeInTheDocument();
        expect(screen.queryByText(/Original evidence/)).not.toBeInTheDocument();
    });

    test('renders the resolution empty state instead of the evidence one', () => {
        render(<ProtectedEvidenceGallery images={[]} labelVariant="resolution" />);

        expect(screen.getByText('No resolution photos attached.')).toBeInTheDocument();
        expect(screen.queryByText('No evidence attached.')).not.toBeInTheDocument();
    });

    test('the default variant keeps the evidence labeling untouched (fail-closed without a descriptor)', () => {
        render(<ProtectedEvidenceGallery {...resolutionProps} labelVariant="evidence" />);

        // Without a server evidence descriptor the fail-closed model shows
        // the evidence empty state — and never the resolution labeling.
        expect(screen.getByText('No evidence attached.')).toBeInTheDocument();
        expect(screen.queryByText(/resolution/i)).not.toBeInTheDocument();
    });
});

describe('ProtectedEvidenceGallery viewImage payload labeling', () => {
    beforeEach(() => {
        clearBlobCache();
        mocks.getProtected.mockReset();
        mocks.getProtected.mockResolvedValue({
            data: new Blob(['fake image data'], { type: 'image/jpeg' }),
        });
        globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/fake-image');
        globalThis.URL.revokeObjectURL = vi.fn();
    });

    test('resolution variant: onViewImage payload items carry the resolution labels', async () => {
        const onViewImage = vi.fn();
        render(
            <ProtectedEvidenceGallery
                images={['/api/files/aaa/resolution-1.jpg', '/api/files/bbb/resolution-2.jpg']}
                accessLevel="original"
                isOperational={true}
                labelVariant="resolution"
                onViewImage={onViewImage}
            />
        );

        fireEvent.click(await screen.findByRole('button', { name: /View resolution photo 1/i }));

        expect(onViewImage).toHaveBeenCalledTimes(1);
        const [payload, index, items] = onViewImage.mock.calls[0];
        expect(index).toBe(0);
        expect(payload.total).toBe(2);
        // Every entry in the payload's items array carries the labels, so a
        // caller-rendered ImageViewer (which reads item.items[activeIndex])
        // shows the resolution wording instead of the evidence defaults.
        expect(payload.items).toHaveLength(2);
        for (const entry of payload.items) {
            expect(entry.entityLabel).toBe('Resolution photo');
            expect(entry.originalNoun).toBe('Resolution photo');
        }
        expect(items).toHaveLength(2);
        expect(items[0].entityLabel).toBe('Resolution photo');
        expect(items[0].originalNoun).toBe('Resolution photo');
    });

    test('default variant: onViewImage payload items carry no resolution labels', async () => {
        const onViewImage = vi.fn();
        const evidence = {
            count: 2,
            viewerAccess: 'original',
            items: [
                { id: '0', index: 0, originalUrl: '/api/files/aaa/e1.jpg', accessLevel: 'original' },
                { id: '1', index: 1, originalUrl: '/api/files/bbb/e2.jpg', accessLevel: 'original' },
            ],
        };
        render(<ProtectedEvidenceGallery evidence={evidence} onViewImage={onViewImage} />);

        fireEvent.click(await screen.findByRole('button', { name: /View evidence photo 1/i }));

        expect(onViewImage).toHaveBeenCalledTimes(1);
        const [payload] = onViewImage.mock.calls[0];
        for (const entry of payload.items) {
            expect(entry.entityLabel).toBeUndefined();
            expect(entry.originalNoun).toBeUndefined();
        }
    });
});
