import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import ImageViewer from '../components/ui/ImageViewer';

describe('ImageViewer Component Security, Privacy Boundary, and Provenance', () => {
    test('1. Renders face-redacted preview for redacted viewer access without any download controls', () => {
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
        expect(screen.getByText('Evidence photo 1')).toBeInTheDocument();
        expect(screen.getByText(/Faces redacted for privacy · Scene details preserved/i)).toBeInTheDocument();

        // Image rendered with exact redacted source
        const img = screen.getByRole('img', { name: /Incident evidence photo 1, faces blurred for privacy/i });
        expect(img).toHaveAttribute('src', '/api/reports/report-1/evidence/0/preview');

        // Confirm NO download link or button exists
        expect(screen.queryByRole('link', { name: /Download/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Download/i })).not.toBeInTheDocument();

        // Close on escape key
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    test('2. Refuses to render when a protected GridFS URL is passed with redacted access', () => {
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
        expect(screen.queryByRole('link', { name: /Download/i })).not.toBeInTheDocument();
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

        expect(screen.getByText(/Privacy-safe preview · Detail visibility limited/i)).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /Download/i })).not.toBeInTheDocument();
    });

    test('6. Renders original evidence for authorized report owner without download control', () => {
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
        expect(screen.getByText(/Original evidence · Report owner/i)).toBeInTheDocument();

        const img = screen.getByRole('img', { name: /Incident evidence photo 1/i });
        expect(img).toHaveAttribute('src', 'blob:http://localhost/owner-original-blob');

        // Confirm NO download control is rendered for owner in map view
        expect(screen.queryByRole('link', { name: /Download/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Download/i })).not.toBeInTheDocument();
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

        expect(screen.getByText(/Original evidence · Operational access/i)).toBeInTheDocument();

        const zoomBtn = screen.getByRole('button', { name: /Zoom in image/i });
        expect(zoomBtn).toBeInTheDocument();

        fireEvent.click(zoomBtn);
        expect(screen.getByRole('button', { name: /Zoom out image/i })).toBeInTheDocument();

        // Confirm NO download control is rendered
        expect(screen.queryByRole('link', { name: /Download/i })).not.toBeInTheDocument();
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

    test('9. Preserves image aspect ratio with object-contain and does not crop document evidence', () => {
        const item = {
            id: '0',
            index: 0,
            viewerAccess: 'original',
            sourceKind: 'authorized-original',
            src: 'blob:http://localhost/document-evidence.jpg',
            isOperational: true,
            alt: 'Document evidence',
        };

        render(
            <ImageViewer
                isOpen={true}
                item={item}
            />
        );

        const img = screen.getByRole('img', { name: /Document evidence/i });
        expect(img).toHaveClass('object-contain');
    });

    test('10. Supports keyboard zoom shortcuts (+, -, 0, r) and reset zoom control', () => {
        const item = {
            id: '0',
            index: 0,
            viewerAccess: 'original',
            sourceKind: 'authorized-original',
            src: 'blob:http://localhost/test-image.jpg',
            isOperational: true,
        };

        render(
            <ImageViewer
                isOpen={true}
                item={item}
            />
        );

        const img = screen.getByRole('img');
        expect(img).toHaveClass('scale-100');

        // Zoom in with '+'
        fireEvent.keyDown(window, { key: '+' });
        expect(img).toHaveClass('scale-125');

        // Zoom out with '-'
        fireEvent.keyDown(window, { key: '-' });
        expect(img).toHaveClass('scale-100');

        // Zoom in with '=' and reset with '0'
        fireEvent.keyDown(window, { key: '=' });
        expect(img).toHaveClass('scale-125');
        fireEvent.keyDown(window, { key: '0' });
        expect(img).toHaveClass('scale-100');

        // Zoom in and reset with reset button
        fireEvent.keyDown(window, { key: '+' });
        expect(img).toHaveClass('scale-125');
        const resetBtn = screen.getByRole('button', { name: /Reset image zoom/i });
        fireEvent.click(resetBtn);
        expect(img).toHaveClass('scale-100');
    });

    test('11. Displays accessible error state when image fails to load', () => {
        const item = {
            id: '0',
            index: 0,
            viewerAccess: 'original',
            sourceKind: 'authorized-original',
            src: 'blob:http://localhost/broken-image.jpg',
            isOperational: true,
        };

        render(
            <ImageViewer
                isOpen={true}
                item={item}
            />
        );

        const img = screen.getByRole('img');
        fireEvent.error(img);

        expect(screen.getByRole('alert')).toHaveTextContent(/Unable to load image/i);
    });

    test('12. Renders accessible dialog attributes and footer privacy status', () => {
        const item = {
            id: '0',
            index: 0,
            viewerAccess: 'redacted',
            sourceKind: 'redacted-preview',
            src: '/api/reports/123/evidence/0/preview',
            redactedPreviewUrl: '/api/reports/123/evidence/0/preview',
            detectionStatus: 'privacy_derivative',
            redactionType: 'public_soft_blur',
        };

        render(
            <ImageViewer
                isOpen={true}
                item={item}
            />
        );

        const dialog = screen.getByRole('dialog', { name: /Enlarged evidence image viewer/i });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(screen.getByText(/Privacy-safe preview · Original evidence restricted/i)).toBeInTheDocument();
    });

    test('13. Renders full multi-item evidence title without truncation classes', () => {
        const item = {
            id: '0',
            index: 0,
            total: 4,
            viewerAccess: 'original',
            sourceKind: 'authorized-original',
            src: 'blob:http://localhost/evidence-1.jpg',
            isOperational: true,
        };

        render(
            <ImageViewer
                isOpen={true}
                item={item}
            />
        );

        const titleHeading = screen.getByRole('heading', { level: 3 });
        expect(titleHeading).toHaveTextContent('Evidence photo 1 of 4');
        expect(titleHeading).not.toHaveClass('truncate');
        expect(titleHeading).toHaveClass('break-words');
        expect(titleHeading).toHaveClass('line-clamp-2');
    });

    test('14. Responsive header keeps toolbar controls shrink-0 and fully clickable', () => {
        const onClose = vi.fn();
        const item = {
            id: '0',
            index: 0,
            viewerAccess: 'original',
            sourceKind: 'authorized-original',
            src: 'blob:http://localhost/evidence-1.jpg',
            isOperational: true,
        };

        render(
            <ImageViewer
                isOpen={true}
                item={item}
                onClose={onClose}
            />
        );

        const closeBtn = screen.getByRole('button', { name: /Close image viewer/i });
        expect(closeBtn).toBeInTheDocument();
        fireEvent.click(closeBtn);
        expect(onClose).toHaveBeenCalled();

        const zoomBtn = screen.getByRole('button', { name: /Zoom in image/i });
        expect(zoomBtn).toBeInTheDocument();
        fireEvent.click(zoomBtn);

        const resetBtn = screen.getByRole('button', { name: /Reset image zoom/i });
        expect(resetBtn).not.toBeDisabled();
    });

    test('15. Sizing and layout handles portrait documents and landscape photos with object-contain', () => {
        const item = {
            id: 'doc-1',
            index: 0,
            viewerAccess: 'original',
            sourceKind: 'authorized-original',
            src: 'blob:http://localhost/portrait-doc.jpg',
            isOperational: true,
            alt: 'Portrait incident document',
        };

        render(
            <ImageViewer
                isOpen={true}
                item={item}
            />
        );

        const img = screen.getByRole('img', { name: /Portrait incident document/i });
        expect(img).toHaveClass('object-contain');
        expect(img).not.toHaveClass('object-cover');
        expect(img).not.toHaveClass('object-fill');
    });

    test('16. Header displays clean title without duplicate operational access badge', () => {
        const item = {
            id: '0',
            index: 0,
            viewerAccess: 'original',
            sourceKind: 'authorized-original',
            src: 'blob:http://localhost/evidence-1.jpg',
            isOperational: true,
        };

        render(
            <ImageViewer
                isOpen={true}
                item={item}
            />
        );

        // Header has the title
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo 1');

        // Status is displayed in footer once
        const statusBadges = screen.getAllByText(/Original evidence · Operational access/i);
        expect(statusBadges).toHaveLength(1);
    });
});
