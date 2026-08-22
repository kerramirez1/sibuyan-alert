import { fireEvent, render, screen } from '@testing-library/react';
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
            accessLevel: 'blurred',
            items: [
                {
                    id: '0',
                    index: 0,
                    previewUrl: '/api/reports/report-1/evidence/0/preview',
                    accessLevel: 'blurred',
                    alt: 'Incident evidence photo 1, faces blurred for privacy',
                },
            ],
        };

        render(<ProtectedEvidenceGallery evidence={evidence} accessLevel="blurred" />);

        expect(screen.getByText('Faces blurred for privacy')).toBeInTheDocument();
        expect(screen.getByRole('img', { name: /Incident evidence photo 1, faces blurred for privacy/i }))
            .toHaveAttribute('src', '/api/reports/report-1/evidence/0/preview');
        expect(screen.getByText(/Original evidence is available only to the report owner and authorized municipal personnel/i))
            .toBeInTheDocument();
        expect(mocks.getProtected).not.toHaveBeenCalled();
    });

    test('2. Rejects protected /api/files/... URLs safely when in blurred mode', () => {
        const evidence = {
            count: 1,
            accessLevel: 'blurred',
            items: [
                {
                    id: '0',
                    index: 0,
                    previewUrl: '/api/files/607f1f77bcf86cd799439011/photo.jpg',
                    accessLevel: 'blurred',
                },
            ],
        };

        render(<ProtectedEvidenceGallery evidence={evidence} accessLevel="blurred" />);

        expect(mocks.getProtected).not.toHaveBeenCalled();
        expect(screen.getByText('Evidence preview unavailable')).toBeInTheDocument();
    });

    test('3. Fetches authenticated protected image for report owner and allows lightbox view', async () => {
        const evidence = {
            count: 1,
            accessLevel: 'original',
            items: [
                {
                    id: '0',
                    index: 0,
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
        expect(await screen.findByAltText('Incident evidence 1')).toBeInTheDocument();
    });

    test('4. Renders "No evidence attached." empty state when evidence list is empty', () => {
        render(<ProtectedEvidenceGallery images={[]} evidence={{ count: 0, items: [] }} />);

        expect(screen.getByText('No evidence attached.')).toBeInTheDocument();
    });
});
