import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import ProtectedEvidenceGallery from '../components/report/ProtectedEvidenceGallery';

const mocks = vi.hoisted(() => ({
    getProtected: vi.fn(),
}));

vi.mock('../services/api', () => ({
    filesAPI: { getProtected: mocks.getProtected },
}));

describe('ProtectedEvidenceGallery Component', () => {
    beforeEach(() => {
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

        expect(screen.getByText('Faces blurred for privacy')).toBeInTheDocument();
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
        expect(screen.getByText('Privacy-safe preview')).toBeInTheDocument();
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

        expect(screen.getByText('Scene preview')).toBeInTheDocument();
        expect(screen.getByText('Privacy preview')).toBeInTheDocument();
    });
});

