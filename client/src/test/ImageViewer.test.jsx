import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import ImageViewer from '../components/ui/ImageViewer';
import { filesAPI } from '../services/api';
import { clearBlobCache } from '../utils/blobCache';

vi.mock('../services/api', () => ({
    filesAPI: {
        getProtected: vi.fn(),
    },
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

describe('ImageViewer Component Security, Privacy Boundary, and Provenance', () => {
    beforeEach(() => {
        clearBlobCache();
        vi.clearAllMocks();
        filesAPI.getProtected.mockResolvedValue({
            data: new Blob(['mock-binary'], { type: 'image/jpeg' }),
        });
        globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-blob-image');
        globalThis.URL.revokeObjectURL = vi.fn();
    });
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
        expect(screen.getByText('Evidence photo preview')).toBeInTheDocument();
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

        expect(screen.getByText('Evidence photo preview')).toBeInTheDocument();
        expect(screen.getByText(/Owner access · Original evidence/i)).toBeInTheDocument();

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
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo preview');

        // Status is displayed in footer once
        const statusBadges = screen.getAllByText(/Original evidence · Operational access/i);
        expect(statusBadges).toHaveLength(1);
    });

    test('17. Single evidence item does not show active multi-evidence navigation buttons', () => {
        const singleItem = {
            id: '0',
            index: 0,
            viewerAccess: 'original',
            sourceKind: 'authorized-original',
            src: 'blob:http://localhost/single-photo.jpg',
            isOperational: true,
        };

        render(
            <ImageViewer
                isOpen={true}
                item={singleItem}
            />
        );

        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo preview');
        expect(screen.queryByRole('button', { name: /Previous evidence photo/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Next evidence photo/i })).not.toBeInTheDocument();
    });

    test('18. Multiple evidence items render previous and next buttons with correct disable bounds and counter', () => {
        const items = [
            { id: 'ev-0', index: 0, viewerAccess: 'original', sourceKind: 'authorized-original', src: 'blob:http://localhost/ev-0.jpg', alt: 'Scene overview photo 1' },
            { id: 'ev-1', index: 1, viewerAccess: 'original', sourceKind: 'authorized-original', src: 'blob:http://localhost/ev-1.jpg', alt: 'Vehicle damage photo 2' },
            { id: 'ev-2', index: 2, viewerAccess: 'original', sourceKind: 'authorized-original', src: 'blob:http://localhost/ev-2.jpg', alt: 'Skid marks photo 3' },
        ];

        render(
            <ImageViewer
                isOpen={true}
                items={items}
                initialIndex={0}
            />
        );

        // Header counter shows "Evidence photo 1 of 3"
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo 1 of 3');

        // Previous button is disabled at index 0
        const prevBtns = screen.getAllByRole('button', { name: /Previous evidence photo/i });
        prevBtns.forEach(btn => expect(btn).toBeDisabled());

        // Next button is enabled at index 0
        const nextBtns = screen.getAllByRole('button', { name: /Next evidence photo/i });
        expect(nextBtns[0]).not.toBeDisabled();

        // Image displays item 0
        expect(screen.getByRole('img', { name: /Scene overview photo 1/i })).toHaveAttribute('src', 'blob:http://localhost/ev-0.jpg');
    });

    test('19. Navigates forward and backward with Next and Previous buttons and updates counter and image', () => {
        const items = [
            { id: 'ev-0', index: 0, viewerAccess: 'original', sourceKind: 'authorized-original', src: 'blob:http://localhost/ev-0.jpg', alt: 'Scene overview photo 1' },
            { id: 'ev-1', index: 1, viewerAccess: 'original', sourceKind: 'authorized-original', src: 'blob:http://localhost/ev-1.jpg', alt: 'Vehicle damage photo 2' },
            { id: 'ev-2', index: 2, viewerAccess: 'original', sourceKind: 'authorized-original', src: 'blob:http://localhost/ev-2.jpg', alt: 'Skid marks photo 3' },
        ];

        render(
            <ImageViewer
                isOpen={true}
                items={items}
                initialIndex={0}
            />
        );

        const nextBtn = screen.getAllByRole('button', { name: /Next evidence photo/i })[0];
        fireEvent.click(nextBtn);

        // Counter updates to "Evidence photo 2 of 3"
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo 2 of 3');
        expect(screen.getByRole('img', { name: /Vehicle damage photo 2/i })).toHaveAttribute('src', 'blob:http://localhost/ev-1.jpg');

        // Click next again to reach last item
        fireEvent.click(nextBtn);
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo 3 of 3');
        expect(screen.getByRole('img', { name: /Skid marks photo 3/i })).toHaveAttribute('src', 'blob:http://localhost/ev-2.jpg');

        // Next button is now disabled
        expect(nextBtn).toBeDisabled();

        // Click previous to return to item 2
        const prevBtn = screen.getAllByRole('button', { name: /Previous evidence photo/i })[0];
        fireEvent.click(prevBtn);
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo 2 of 3');
    });

    test('20. Navigates forward and backward via ArrowLeft and ArrowRight keyboard shortcuts', () => {
        const items = [
            { id: 'ev-0', index: 0, viewerAccess: 'original', sourceKind: 'authorized-original', src: 'blob:http://localhost/ev-0.jpg', alt: 'Photo 1' },
            { id: 'ev-1', index: 1, viewerAccess: 'original', sourceKind: 'authorized-original', src: 'blob:http://localhost/ev-1.jpg', alt: 'Photo 2' },
        ];

        render(
            <ImageViewer
                isOpen={true}
                items={items}
                initialIndex={0}
            />
        );

        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo 1 of 2');

        // Press ArrowRight
        fireEvent.keyDown(window, { key: 'ArrowRight' });
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo 2 of 2');
        expect(screen.getByRole('img', { name: /Photo 2/i })).toBeInTheDocument();

        // Press ArrowLeft
        fireEvent.keyDown(window, { key: 'ArrowLeft' });
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo 1 of 2');
    });

    test('21. Resets zoom level when navigating between evidence items', () => {
        const items = [
            { id: 'ev-0', index: 0, viewerAccess: 'original', sourceKind: 'authorized-original', src: 'blob:http://localhost/ev-0.jpg', alt: 'Photo 1' },
            { id: 'ev-1', index: 1, viewerAccess: 'original', sourceKind: 'authorized-original', src: 'blob:http://localhost/ev-1.jpg', alt: 'Photo 2' },
        ];

        render(
            <ImageViewer
                isOpen={true}
                items={items}
                initialIndex={0}
            />
        );

        const img = screen.getByRole('img');
        expect(img).toHaveClass('scale-100');

        // Zoom in on item 0
        fireEvent.keyDown(window, { key: '+' });
        expect(img).toHaveClass('scale-125');

        // Navigate to item 1 -> Zoom should reset to scale-100
        fireEvent.keyDown(window, { key: 'ArrowRight' });
        const nextImg = screen.getByRole('img');
        expect(nextImg).toHaveClass('scale-100');
    });

    test('22. Displays item-specific error state while keeping Previous and Next navigation buttons active', () => {
        const items = [
            { id: 'ev-0', index: 0, viewerAccess: 'original', sourceKind: 'authorized-original', src: 'blob:http://localhost/broken-photo.jpg', alt: 'Broken photo' },
            { id: 'ev-1', index: 1, viewerAccess: 'original', sourceKind: 'authorized-original', src: 'blob:http://localhost/valid-photo.jpg', alt: 'Valid photo' },
        ];

        render(
            <ImageViewer
                isOpen={true}
                items={items}
                initialIndex={0}
            />
        );

        const img = screen.getByRole('img');
        fireEvent.error(img);

        // Error message is displayed for item 0
        expect(screen.getByRole('alert')).toHaveTextContent(/Unable to load image/i);

        // Navigation to next item is still available
        const nextBtn = screen.getAllByRole('button', { name: /Next evidence photo/i })[0];
        expect(nextBtn).not.toBeDisabled();
        fireEvent.click(nextBtn);

        // Item 1 renders successfully
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo 2 of 2');
        expect(screen.getByRole('img', { name: /Valid photo/i })).toBeInTheDocument();
    });

    test('23. In redacted mode, navigating between items maintains strict redacted preview security and never exposes original files', () => {
        const redactedItems = [
            {
                id: '0',
                index: 0,
                viewerAccess: 'redacted',
                sourceKind: 'redacted-preview',
                src: '/api/reports/123/evidence/0/preview',
                redactedPreviewUrl: '/api/reports/123/evidence/0/preview',
                detectionStatus: 'faces_detected',
                redactionType: 'face_blur',
            },
            {
                id: '1',
                index: 1,
                viewerAccess: 'redacted',
                sourceKind: 'redacted-preview',
                src: '/api/reports/123/evidence/1/preview',
                redactedPreviewUrl: '/api/reports/123/evidence/1/preview',
                detectionStatus: 'no_faces_detected',
                redactionType: 'none',
            },
        ];

        render(
            <ImageViewer
                isOpen={true}
                items={redactedItems}
                initialIndex={0}
            />
        );

        // Item 0: faces redacted label
        expect(screen.getByText(/Faces redacted for privacy · Scene details preserved/i)).toBeInTheDocument();

        // Navigate to Item 1
        fireEvent.keyDown(window, { key: 'ArrowRight' });

        // Item 1: clean scene preview label
        expect(screen.getByText(/Clean scene preview · Scene details preserved/i)).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo 2 of 2');

        // Zero download controls
        expect(screen.queryByRole('link', { name: /Download/i })).not.toBeInTheDocument();
    });

    test('24. Modal surface and image canvas maintain stable reserved dimensions during protected evidence loading', async () => {
        let resolveProtected;
        filesAPI.getProtected.mockImplementation(() => new Promise((resolve) => {
            resolveProtected = resolve;
        }));

        const items = [
            { id: 'ev-0', index: 0, viewerAccess: 'original', sourceKind: 'authorized-original', originalUrl: '/api/files/111/photo1.jpg', alt: 'Photo 1' },
            { id: 'ev-1', index: 1, viewerAccess: 'original', sourceKind: 'authorized-original', originalUrl: '/api/files/222/photo2.jpg', alt: 'Photo 2' },
        ];

        render(
            <ImageViewer
                isOpen={true}
                items={items}
                initialIndex={0}
            />
        );

        // 1. Surface and canvas maintain stable layout during loading
        const surface = screen.getByTestId('evidence-viewer-surface');
        expect(surface).toHaveClass('sm:h-[82vh]');
        expect(surface).toHaveClass('sm:max-w-2xl');

        const canvas = screen.getByTestId('evidence-viewer-canvas');
        expect(canvas).toHaveClass('flex-1');
        expect(canvas).toHaveClass('min-h-0');
        expect(canvas).toHaveClass('w-full');

        // Loading indicator is present inside the canvas
        expect(screen.getByTestId('evidence-loading-indicator')).toBeInTheDocument();
        expect(screen.getByText(/Loading protected evidence/i)).toBeInTheDocument();

        // 2. Resolve image fetch
        await resolveProtected({
            data: new Blob(['binary-data'], { type: 'image/jpeg' }),
        });

        // Image canvas still maintains the exact same layout classes
        expect(canvas).toHaveClass('flex-1');
        expect(canvas).toHaveClass('min-h-0');
        expect(canvas).toHaveClass('w-full');
    });

    test('25. Centered loading indicator displays clear accessible loading message without collapsing modal height', () => {
        filesAPI.getProtected.mockReturnValue(new Promise(() => {})); // Never resolves (stays in loading state)

        const item = {
            id: 'ev-0',
            index: 0,
            viewerAccess: 'original',
            sourceKind: 'authorized-original',
            originalUrl: '/api/files/111/photo.jpg',
            alt: 'Photo 1',
        };

        render(
            <ImageViewer
                isOpen={true}
                item={item}
            />
        );

        const loadingIndicator = screen.getByRole('status');
        expect(loadingIndicator).toBeInTheDocument();
        expect(loadingIndicator).toHaveAttribute('aria-live', 'polite');
        expect(loadingIndicator).toHaveTextContent(/Loading protected evidence/i);

        // Header and close controls remain accessible and positioned
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo preview');
        expect(screen.getByRole('button', { name: /Close image viewer/i })).toBeInTheDocument();
    });

    test('26. Discards stale image response when user navigates quickly between evidence items', async () => {
        let resolveFirst;
        let resolveSecond;

        filesAPI.getProtected
            .mockImplementationOnce(() => new Promise((resolve) => {
                resolveFirst = resolve;
            }))
            .mockImplementationOnce(() => new Promise((resolve) => {
                resolveSecond = resolve;
            }));

        const items = [
            { id: 'ev-0', index: 0, viewerAccess: 'original', sourceKind: 'authorized-original', originalUrl: '/api/files/111/photo1.jpg', alt: 'Photo 1' },
            { id: 'ev-1', index: 1, viewerAccess: 'original', sourceKind: 'authorized-original', originalUrl: '/api/files/222/photo2.jpg', alt: 'Photo 2' },
        ];

        render(
            <ImageViewer
                isOpen={true}
                items={items}
                initialIndex={0}
            />
        );

        // Immediately navigate to Item 2 before Item 1 resolves
        const nextBtn = screen.getAllByRole('button', { name: /Next evidence photo/i })[0];
        fireEvent.click(nextBtn);

        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo 2 of 2');

        // Resolve Item 2 first
        await resolveSecond({
            data: new Blob(['item-2-data'], { type: 'image/jpeg' }),
        });

        // Later, Item 1 resolves (stale response)
        await resolveFirst({
            data: new Blob(['item-1-stale-data'], { type: 'image/jpeg' }),
        });

        // Header remains on Item 2, not overridden by Item 1
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo 2 of 2');
    });

    test('27. Previous and Next navigation buttons remain interactive and clickable during active loading', async () => {
        filesAPI.getProtected.mockReturnValue(new Promise(() => {})); // Never resolves (stays loading)

        const items = [
            { id: 'ev-0', index: 0, viewerAccess: 'original', sourceKind: 'authorized-original', originalUrl: '/api/files/111/photo1.jpg', alt: 'Photo 1' },
            { id: 'ev-1', index: 1, viewerAccess: 'original', sourceKind: 'authorized-original', originalUrl: '/api/files/222/photo2.jpg', alt: 'Photo 2' },
            { id: 'ev-2', index: 2, viewerAccess: 'original', sourceKind: 'authorized-original', originalUrl: '/api/files/333/photo3.jpg', alt: 'Photo 3' },
        ];

        render(
            <ImageViewer
                isOpen={true}
                items={items}
                initialIndex={0}
            />
        );

        // During loading on item 0, Next button is interactive
        const nextBtn = screen.getAllByRole('button', { name: /Next evidence photo/i })[0];
        expect(nextBtn).not.toBeDisabled();

        // Click next while loading
        fireEvent.click(nextBtn);
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo 2 of 3');

        // Click next again to reach item 3
        fireEvent.click(nextBtn);
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Evidence photo 3 of 3');
    });

    test('28. Desktop uses compact purposeful max-width while mobile preserves full-screen layout', () => {
        const item = {
            id: 'ev-0',
            index: 0,
            viewerAccess: 'redacted',
            sourceKind: 'redacted-preview',
            redactedPreviewUrl: '/api/reports/rep-1/evidence/0/preview',
            alt: 'Document evidence',
        };

        render(
            <ImageViewer
                isOpen={true}
                item={item}
            />
        );

        const surface = screen.getByTestId('evidence-viewer-surface');
        // Mobile layout: full width and height with safe area insets
        expect(surface).toHaveClass('w-full');
        expect(surface).toHaveClass('h-full');

        // Desktop layout: compact purposeful review size (max-w-2xl / responsive width)
        expect(surface).toHaveClass('sm:max-w-2xl');
        expect(surface).toHaveClass('sm:w-[88vw]');
        expect(surface).toHaveClass('md:w-[72vw]');
        expect(surface).toHaveClass('lg:w-[56vw]');
        expect(surface).toHaveClass('sm:h-[82vh]');
        expect(surface).toHaveClass('sm:max-h-[760px]');
    });

    test('29. Preserves object-contain and canvas stability when switching between portrait and landscape evidence', () => {
        const items = [
            {
                id: 'ev-0',
                index: 0,
                viewerAccess: 'redacted',
                sourceKind: 'redacted-preview',
                redactedPreviewUrl: '/api/reports/rep-1/evidence/0/preview',
                alt: 'Portrait document photo 1',
            },
            {
                id: 'ev-1',
                index: 1,
                viewerAccess: 'redacted',
                sourceKind: 'redacted-preview',
                redactedPreviewUrl: '/api/reports/rep-1/evidence/1/preview',
                alt: 'Landscape scene photo 2',
            },
        ];

        render(
            <ImageViewer
                isOpen={true}
                items={items}
                initialIndex={0}
            />
        );

        const canvas = screen.getByTestId('evidence-viewer-canvas');
        const img = screen.getByRole('img');

        // Portrait photo item 1
        expect(img).toHaveClass('object-contain');
        expect(img).toHaveClass('max-h-full');
        expect(img).toHaveClass('max-w-full');
        expect(canvas).toHaveClass('flex-1');
        expect(canvas).toHaveClass('min-h-0');

        // Navigate to landscape photo item 2
        const nextBtn = screen.getAllByRole('button', { name: /Next evidence photo/i })[0];
        fireEvent.click(nextBtn);

        const updatedImg = screen.getByRole('img');
        expect(updatedImg).toHaveAttribute('alt', 'Landscape scene photo 2');
        expect(updatedImg).toHaveClass('object-contain');
        expect(canvas).toHaveClass('flex-1');
        expect(canvas).toHaveClass('min-h-0');
    });

    test('30. Restrained background overlay prevents background interaction and locks body scroll', () => {
        const onClose = vi.fn();
        const item = {
            id: 'ev-0',
            index: 0,
            viewerAccess: 'redacted',
            sourceKind: 'redacted-preview',
            redactedPreviewUrl: '/api/reports/rep-1/evidence/0/preview',
        };

        const { unmount } = render(
            <ImageViewer
                isOpen={true}
                item={item}
                onClose={onClose}
            />
        );

        const dialog = screen.getByRole('dialog', { name: /Enlarged evidence image viewer/i });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveClass('bg-black/80');
        expect(document.body.style.overflow).toBe('hidden');

        // Clicking backdrop closes viewer
        fireEvent.click(dialog);
        expect(onClose).toHaveBeenCalledTimes(1);

        unmount();
        expect(document.body.style.overflow).not.toBe('hidden');
    });

    test('31. Refined toolbar controls feature borderless minimal styling with accessible contrast and focus rings', () => {
        const onClose = vi.fn();
        const item = {
            id: 'ev-0',
            index: 0,
            total: 2,
            viewerAccess: 'original',
            sourceKind: 'authorized-original',
            src: 'blob:http://localhost/evidence-clean.jpg',
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
        const zoomBtn = screen.getByRole('button', { name: /Zoom in image/i });
        const rotateBtn = screen.getByRole('button', { name: /Rotate image/i });
        const resetBtn = screen.getByRole('button', { name: /Reset image zoom/i });

        // Ensure buttons have focus-visible rings and hover treatments
        [closeBtn, zoomBtn, rotateBtn, resetBtn].forEach((btn) => {
            expect(btn).toHaveClass('focus-visible:ring-2');
            expect(btn).toHaveClass('focus-visible:ring-emerald-400');
            expect(btn).not.toHaveClass('border');
        });
    });

    test('32. Rotate button and keyboard shortcuts cycle image rotation by 90 degrees', () => {
        const item = {
            id: 'ev-0',
            index: 0,
            viewerAccess: 'original',
            sourceKind: 'authorized-original',
            src: 'blob:http://localhost/evidence-rot.jpg',
            isOperational: true,
        };

        render(
            <ImageViewer
                isOpen={true}
                item={item}
            />
        );

        const img = screen.getByRole('img');
        const rotateBtn = screen.getByRole('button', { name: /Rotate image/i });
        const resetBtn = screen.getByRole('button', { name: /Reset image zoom/i });

        expect(img).not.toHaveStyle('transform: rotate(90deg)');

        // Click rotate button
        fireEvent.click(rotateBtn);
        expect(img).toHaveStyle('transform: rotate(90deg)');

        // Rotate again via keyboard shortcut 'r'
        fireEvent.keyDown(window, { key: 'r' });
        expect(img).toHaveStyle('transform: rotate(180deg)');

        // Reset zoom & rotation with reset button
        fireEvent.click(resetBtn);
        expect(img.style.transform).toBe('');
    });

    test('33. Supports custom entityLabel prop for context-aware headers and navigation labels', () => {
        const items = [
            { id: 'ref-0', index: 0, viewerAccess: 'original', sourceKind: 'authorized-original', src: 'blob:http://localhost/ref-0.jpg' },
            { id: 'ref-1', index: 1, viewerAccess: 'original', sourceKind: 'authorized-original', src: 'blob:http://localhost/ref-1.jpg' },
        ];

        const { rerender } = render(
            <ImageViewer
                isOpen={true}
                items={items}
                initialIndex={0}
                entityLabel="Field reference"
            />
        );

        // Header and navigation for multiple items
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Field reference 1 of 2');
        expect(screen.getByRole('button', { name: /Next field reference/i })).toBeInTheDocument();

        // Single item with custom entityLabel
        rerender(
            <ImageViewer
                isOpen={true}
                items={[items[0]]}
                initialIndex={0}
                entityLabel="Site photo"
            />
        );

        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Site photo preview');
    });

    test('34. Instant reopening: Renders cached protected image immediately without showing loading spinner or sending duplicate network requests', async () => {
        const item = {
            id: 'ev-cached-1',
            index: 0,
            viewerAccess: 'original',
            sourceKind: 'authorized-original',
            src: '/api/files/607f1f77bcf86cd799439099/photo.jpg',
            originalUrl: '/api/files/607f1f77bcf86cd799439099/photo.jpg',
        };

        const { rerender } = render(
            <ImageViewer
                isOpen={true}
                item={item}
            />
        );

        // 1st time opening: downloads from server
        const img = await screen.findByRole('img');
        expect(img).toBeInTheDocument();
        expect(filesAPI.getProtected).toHaveBeenCalledTimes(1);

        // Close viewer
        rerender(
            <ImageViewer
                isOpen={false}
                item={item}
            />
        );

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        // 2nd time opening: instant synchronous cache hit without loading spinner
        rerender(
            <ImageViewer
                isOpen={true}
                item={item}
            />
        );

        // Loading spinner must NOT appear because it's synchronously resolved from cache
        expect(screen.queryByTestId('evidence-loading-indicator')).not.toBeInTheDocument();
        expect(screen.getByRole('img')).toBeInTheDocument();
        expect(filesAPI.getProtected).toHaveBeenCalledTimes(1); // Still exactly 1 call!
    });
});
