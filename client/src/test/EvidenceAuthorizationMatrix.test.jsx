import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import ProtectedEvidenceGallery from '../components/report/ProtectedEvidenceGallery';
import ImageViewer from '../components/ui/ImageViewer';
import { normalizeEvidenceDescriptor } from '../utils/evidenceModel';

const mocks = vi.hoisted(() => ({
    getProtected: vi.fn(),
}));

vi.mock('../services/api', () => ({
    filesAPI: { getProtected: mocks.getProtected },
}));

describe('Evidence Privacy and Fail-Closed Authorization Matrix', () => {
    beforeEach(() => {
        mocks.getProtected.mockReset();
        mocks.getProtected.mockResolvedValue({
            data: new Blob(['raw-original-image-bytes'], { type: 'image/jpeg' }),
        });
        globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/authorized-blob-123');
        globalThis.URL.revokeObjectURL = vi.fn();
    });

    const reportId = '607f1f77bcf86cd799439011';
    const gridFsFileUrl = `/api/files/${reportId}/evidence-photo-1.jpg`;
    const redactedPreviewUrl = `/api/reports/${reportId}/evidence/0/preview?rv=3.4`;

    // Fixture 1: Server response for authenticated Report Owner
    const ownerServerEvidence = {
        evidenceCount: 1,
        count: 1,
        viewerAccess: 'original',
        accessLevel: 'original',
        items: [
            {
                id: '0',
                index: 0,
                redactedPreviewUrl,
                previewUrl: gridFsFileUrl,
                originalUrl: gridFsFileUrl,
                accessLevel: 'original',
                alt: 'Incident evidence photo 1',
                redactionType: 'none',
                detectionStatus: 'no_faces_detected',
                isOwner: true,
            },
        ],
    };

    // Fixture 2: Server response for authorized Operational Responder / Admin
    const operationalServerEvidence = {
        evidenceCount: 1,
        count: 1,
        viewerAccess: 'original',
        accessLevel: 'original',
        items: [
            {
                id: '0',
                index: 0,
                redactedPreviewUrl,
                previewUrl: gridFsFileUrl,
                originalUrl: gridFsFileUrl,
                accessLevel: 'original',
                alt: 'Incident evidence photo 1',
                redactionType: 'none',
                detectionStatus: 'no_faces_detected',
                isOwner: false,
                isOperational: true,
            },
        ],
    };

    // Fixture 3: Server response for Non-Owner Reporter (public DTO)
    const nonOwnerReporterServerEvidence = {
        evidenceCount: 1,
        count: 1,
        viewerAccess: 'redacted',
        accessLevel: 'redacted',
        items: [
            {
                id: '0',
                index: 0,
                redactedPreviewUrl,
                previewUrl: redactedPreviewUrl,
                accessLevel: 'redacted',
                alt: 'Incident evidence photo 1, faces blurred for privacy',
                redactionType: 'face_blur',
                detectionStatus: 'faces_detected',
                redactionVersion: '3.4',
                detectorVersion: 'picojs-facefinder-2.3',
            },
        ],
    };

    // Fixture 4: Server response for Guest / Public User (public DTO)
    const guestServerEvidence = {
        evidenceCount: 1,
        count: 1,
        viewerAccess: 'redacted',
        accessLevel: 'redacted',
        items: [
            {
                id: '0',
                index: 0,
                redactedPreviewUrl,
                previewUrl: redactedPreviewUrl,
                accessLevel: 'redacted',
                alt: 'Incident evidence photo 1, privacy-safe preview',
                redactionType: 'public_soft_blur',
                detectionStatus: 'processing',
                redactionVersion: '3.4',
                detectorVersion: 'picojs-facefinder-2.3',
            },
        ],
    };

    test('1. Report Owner: gets original evidence, see "Your upload" badge, and fetches protected file', async () => {
        const normalized = normalizeEvidenceDescriptor(ownerServerEvidence, {
            isOwner: true,
            rawImages: [gridFsFileUrl],
        });

        expect(normalized.viewerAccess).toBe('original');
        expect(normalized.items[0].sourceKind).toBe('authorized-original');
        expect(normalized.items[0].src).toBe(gridFsFileUrl);
        expect(normalized.items[0].originalUrl).toBe(gridFsFileUrl);

        render(
            <ProtectedEvidenceGallery
                evidence={ownerServerEvidence}
                images={[gridFsFileUrl]}
                accessLevel="original"
                isOwner={true}
            />
        );

        // Thumbnail requests authenticated binary
        expect(await screen.findByText('Your upload')).toBeInTheDocument();
        expect(mocks.getProtected).toHaveBeenCalledWith(gridFsFileUrl, expect.any(Object));

        // Opening ImageViewer displays authorized original blob URL
        fireEvent.click(screen.getByRole('button', { name: /View evidence photo 1/i }));
        const dialog = await screen.findByRole('dialog', { name: /Enlarged evidence image viewer/i });
        const img = within(dialog).getByRole('img');
        expect(img).toHaveAttribute('src', 'blob:http://localhost/authorized-blob-123');
    });

    test('2. Operational Admin / Responder: gets original evidence through authenticated protected file flow', async () => {
        const normalized = normalizeEvidenceDescriptor(operationalServerEvidence, {
            isOperational: true,
            rawImages: [gridFsFileUrl],
        });

        expect(normalized.viewerAccess).toBe('original');
        expect(normalized.items[0].sourceKind).toBe('authorized-original');

        render(
            <ProtectedEvidenceGallery
                evidence={operationalServerEvidence}
                images={[gridFsFileUrl]}
                accessLevel="original"
                isOperational={true}
            />
        );

        expect(mocks.getProtected).toHaveBeenCalledWith(gridFsFileUrl, expect.any(Object));
        fireEvent.click(await screen.findByRole('button', { name: /View evidence photo 1/i }));
        const dialog = await screen.findByRole('dialog', { name: /Enlarged evidence image viewer/i });
        const img = within(dialog).getByRole('img');
        expect(img).toHaveAttribute('src', 'blob:http://localhost/authorized-blob-123');
    });

    test('3. Non-owner Reporter: receives only redacted preview, never calls getProtected, and originalUrl is undefined', async () => {
        const normalized = normalizeEvidenceDescriptor(nonOwnerReporterServerEvidence, {
            isOwner: false,
            isOperational: false,
        });

        expect(normalized.viewerAccess).toBe('redacted');
        expect(normalized.items[0].sourceKind).toBe('redacted-preview');
        expect(normalized.items[0].src).toBe(redactedPreviewUrl);
        expect(normalized.items[0].originalUrl).toBeUndefined();

        render(
            <ProtectedEvidenceGallery
                evidence={nonOwnerReporterServerEvidence}
                isOwner={false}
                isOperational={false}
            />
        );

        expect(screen.getByText('Faces blurred for privacy')).toBeInTheDocument();
        expect(mocks.getProtected).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /faces blurred for privacy/i }));
        const dialog = await screen.findByRole('dialog', { name: /Enlarged evidence image viewer/i });
        const img = within(dialog).getByRole('img');
        expect(img).toHaveAttribute('src', redactedPreviewUrl);
        expect(mocks.getProtected).not.toHaveBeenCalled();
    });

    test('4. Guest / Public User: receives only redacted preview, never receives originalUrl or raw report.images', async () => {
        const normalized = normalizeEvidenceDescriptor(guestServerEvidence, {
            isOwner: false,
            isOperational: false,
        });

        expect(normalized.viewerAccess).toBe('redacted');
        expect(normalized.items[0].sourceKind).toBe('redacted-preview');
        expect(normalized.items[0].src).toBe(redactedPreviewUrl);
        expect(normalized.items[0].originalUrl).toBeUndefined();

        render(
            <ProtectedEvidenceGallery
                evidence={guestServerEvidence}
                images={[]}
                isOwner={false}
                isOperational={false}
            />
        );

        expect(screen.getByText('Privacy-safe preview')).toBeInTheDocument();
        expect(screen.getByText(/Original evidence is available only to the report owner and authorized municipal personnel/i)).toBeInTheDocument();
        expect(mocks.getProtected).not.toHaveBeenCalled();
    });

    test('5. Missing viewerAccess fails closed to redacted and rejects elevation via props', () => {
        const malformedEvidence = {
            count: 1,
            // viewerAccess is deliberately omitted
            items: [
                {
                    id: '0',
                    index: 0,
                    redactedPreviewUrl,
                },
            ],
        };

        const normalized = normalizeEvidenceDescriptor(malformedEvidence, {
            isOwner: true,
            isOperational: true,
            rawImages: [gridFsFileUrl],
        });

        expect(normalized.viewerAccess).toBe('redacted');
        expect(normalized.items[0].sourceKind).toBe('redacted-preview');
        expect(normalized.items[0].originalUrl).toBeUndefined();
    });

    test('6. Redacted mode strictly rejects original GridFS URL, raw image IDs, and upload paths', () => {
        const attackVectors = [
            gridFsFileUrl,
            '/uploads/sensitive-evidence.png',
            '607f1f77bcf86cd799439011',
        ];

        for (const attackUrl of attackVectors) {
            const malformedEvidence = {
                count: 1,
                viewerAccess: 'redacted',
                items: [
                    {
                        id: '0',
                        index: 0,
                        redactedPreviewUrl: attackUrl,
                    },
                ],
            };

            const normalized = normalizeEvidenceDescriptor(malformedEvidence);
            expect(normalized.viewerAccess).toBe('redacted');
            expect(normalized.items[0].src).toBe('');
            expect(normalized.items[0].isUnavailable).toBe(true);
            expect(normalized.items[0].isForbiddenOriginal).toBe(true);
        }
    });

    test('7. ImageViewer cannot be forced into original mode by a frontend prop when item is redacted', () => {
        const redactedItem = {
            id: '0',
            index: 0,
            viewerAccess: 'redacted',
            sourceKind: 'redacted-preview',
            redactedPreviewUrl,
            src: redactedPreviewUrl,
        };

        render(
            <ImageViewer
                isOpen={true}
                item={redactedItem}
                viewerAccess="original" // Malicious prop attempting elevation
            />
        );

        const dialog = screen.getByRole('dialog', { name: /Enlarged evidence image viewer/i });
        const img = within(dialog).getByRole('img');
        expect(img).toHaveAttribute('src', redactedPreviewUrl);
        expect(mocks.getProtected).not.toHaveBeenCalled();
    });

    test('8. ImageViewer displays security violation banner when a protected GridFS URL is injected into redacted mode', () => {
        const tamperedItem = {
            id: '0',
            index: 0,
            viewerAccess: 'redacted',
            sourceKind: 'redacted-preview',
            redactedPreviewUrl: gridFsFileUrl, // Maliciously forged preview URL
        };

        render(
            <ImageViewer
                isOpen={true}
                item={tamperedItem}
                viewerAccess="redacted"
            />
        );

        expect(screen.getByText('Original evidence is protected.')).toBeInTheDocument();
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(mocks.getProtected).not.toHaveBeenCalled();
    });
});
