import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import ImageViewer from '../components/ui/ImageViewer';

describe('ImageViewer Component Security, Privacy Boundary, and Provenance', () => {
    test('1. Renders face-redacted preview and labeled redacted download anchor for redacted viewer access', () => {
        const onClose = vi.fn();
        const item = {
            id: '0',
            index: 0,
            viewerAccess: 'redacted',
            sourceKind: 'redacted-preview',
            src: '/api/reports/report-1/evidence/0/preview',
            redactedPreviewUrl: '/api/reports/report-1/evidence/0/preview',
            detectionStatus: 'faces_detected',
            redactionType: 'face_blur',
            alt: 'Incident evidence photo 1, faces blurred for privacy',
        };

        render(
            <ImageViewer
                isOpen={true}
                item={item}
                onClose={onClose}
            />
        );

        // Header and labels
        expect(screen.getByText('Evidence photo 1 (Faces blurred for privacy)')).toBeInTheDocument();
        expect(screen.getByText(/Faces redacted for privacy · Scene details preserved/i)).toBeInTheDocument();

        // Image rendered with exact redacted source
        const img = screen.getByRole('img', { name: /Incident evidence photo 1, faces blurred for privacy/i });
        expect(img).toHaveAttribute('src', '/api/reports/report-1/evidence/0/preview');

        // Download anchor uses redacted derivative with explicit safe filename
        const downloadAnchor = screen.getByRole('link', { name: /Download preview image with faces blurred for privacy/i });
        expect(downloadAnchor).toHaveAttribute('href', '/api/reports/report-1/evidence/0/preview');
        expect(downloadAnchor).toHaveAttribute('download', 'evidence-1-redacted.jpg');

        // Close on escape key
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    test('2. Refuses to render and refuses to expose download when a protected GridFS URL is passed with redacted access', () => {
        const onClose = vi.fn();
        const item = {
            id: '0',
            index: 0,
            viewerAccess: 'redacted',
            sourceKind: 'redacted-preview',
            src: '/api/files/607f1f77bcf86cd799439011/photo.jpg',
            originalUrl: '/api/files/607f1f77bcf86cd799439011/photo.jpg',
        };

        render(
            <ImageViewer
                isOpen={true}
                item={item}
                onClose={onClose}
            />
        );

        // Security alert is displayed
        expect(screen.getByRole('alert')).toHaveTextContent(/Original evidence is protected/i);
        // Image element and download button must not render
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /Download/i })).not.toBeInTheDocument();
    });

    test('3. Rejects a forged blob URL passed in redacted mode without valid redacted-preview sourceKind', () => {
        const onClose = vi.fn();
        const item = {
            id: '0',
            index: 0,
            viewerAccess: 'redacted',
            sourceKind: 'authorized-original', // Forged or mismatched
            src: 'blob:http://localhost/forged-original-blob',
        };

        render(
            <ImageViewer
                isOpen={true}
                item={item}
                onClose={onClose}
            />
        );

        expect(screen.getByRole('alert')).toHaveTextContent(/Original evidence is protected/i);
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    test('4. Renders clean scene label when server confirms no_faces_detected on document or non-face evidence', () => {
        const onClose = vi.fn();
        const item = {
            id: '0',
            index: 0,
            viewerAccess: 'redacted',
            sourceKind: 'redacted-preview',
            src: '/api/reports/report-1/evidence/0/preview',
            redactedPreviewUrl: '/api/reports/report-1/evidence/0/preview',
            detectionStatus: 'no_faces_detected',
            redactionType: 'none',
            alt: 'Document evidence photo 1',
        };

        render(
            <ImageViewer
                isOpen={true}
                item={item}
                onClose={onClose}
            />
        );

        // Does NOT claim that faces were blurred when none exist
        expect(screen.queryByText(/Faces blurred for privacy · Scene details preserved/i)).not.toBeInTheDocument();
        expect(screen.getByText(/Clean scene preview · Scene details preserved/i)).toBeInTheDocument();
        const img = screen.getByRole('img', { name: /Document evidence photo 1/i });
        expect(img).toHaveAttribute('src', '/api/reports/report-1/evidence/0/preview');
    });

    test('5. Renders privacy-safe limited preview label on full-image fallback or detector error', () => {
        const onClose = vi.fn();
        const item = {
            id: '0',
            index: 0,
            viewerAccess: 'redacted',
            sourceKind: 'redacted-preview',
            src: '/api/reports/report-1/evidence/0/preview',
            redactedPreviewUrl: '/api/reports/report-1/evidence/0/preview',
            detectionStatus: 'detector_failed',
            redactionType: 'fallback_blur',
            alt: 'Incident evidence photo 1',
        };

        render(
            <ImageViewer
                isOpen={true}
                item={item}
                onClose={onClose}
            />
        );

        // Accurately states that visibility is limited rather than claiming only faces were blurred
        expect(screen.getByText(/Privacy-safe preview · Detail visibility limited/i)).toBeInTheDocument();
    });

    test('6. Renders original evidence and authorized download anchor for authorized report owner', () => {
        const onClose = vi.fn();
        const item = {
            id: '0',
            index: 0,
            viewerAccess: 'original',
            sourceKind: 'authorized-original',
            src: 'blob:http://localhost/owner-original-blob',
            isOwner: true,
            alt: 'Incident evidence photo 1',
        };

        render(
            <ImageViewer
                isOpen={true}
                item={item}
                onClose={onClose}
            />
        );

        expect(screen.getByText('Evidence photo 1')).toBeInTheDocument();
        expect(screen.getByText(/Your upload · Viewing original unredacted evidence/i)).toBeInTheDocument();

        const img = screen.getByRole('img', { name: /Incident evidence photo 1/i });
        expect(img).toHaveAttribute('src', 'blob:http://localhost/owner-original-blob');

        const downloadAnchor = screen.getByRole('link', { name: /Download original evidence photo/i });
        expect(downloadAnchor).toHaveAttribute('href', 'blob:http://localhost/owner-original-blob');
        expect(downloadAnchor).toHaveAttribute('download', 'evidence-1.jpg');
    });

    test('7. Renders operational badge and zoom controls for in-scope operational personnel', () => {
        const onClose = vi.fn();
        const item = {
            id: '0',
            index: 0,
            viewerAccess: 'original',
            sourceKind: 'authorized-original',
            src: 'blob:http://localhost/operational-blob',
            isOperational: true,
        };

        render(
            <ImageViewer
                isOpen={true}
                item={item}
                onClose={onClose}
            />
        );

        expect(screen.getByText(/Operational access · Viewing official unredacted evidence/i)).toBeInTheDocument();

        const zoomBtn = screen.getByRole('button', { name: /Zoom in image/i });
        expect(zoomBtn).toBeInTheDocument();

        fireEvent.click(zoomBtn);
        expect(screen.getByRole('button', { name: /Zoom out image/i })).toBeInTheDocument();
    });

    test('8. Rejects raw GridFS imageSrc when viewerAccess is redacted', () => {
        const onClose = vi.fn();

        render(
            <ImageViewer
                isOpen={true}
                item={null}
                imageSrc="/api/files/607f1f77bcf86cd799439011/photo.jpg"
                viewerAccess="redacted"
                onClose={onClose}
            />
        );

        expect(screen.getByRole('alert')).toHaveTextContent(/Original evidence is protected/i);
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });
});
