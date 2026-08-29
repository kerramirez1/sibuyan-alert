import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { filesAPIMock } = vi.hoisted(() => ({
    filesAPIMock: {
        getProtected: vi.fn(),
    },
}));

vi.mock('../../services/api', () => ({
    filesAPI: filesAPIMock,
}));

// Also support relative import path from components
vi.mock('../services/api', () => ({
    filesAPI: filesAPIMock,
}));

import HighRiskZoneDetails from '../components/map/HighRiskZoneDetails';

const mockZoneWithPhotos = {
    _id: 'zone-cajidiocan-1',
    name: 'Cambajao River Flash Flood Zone',
    description: 'Prone to rapid river overflow and landslide debris during heavy rains.',
    type: 'landslide_prone',
    severity: 'high',
    radius: 180,
    municipality: 'Cajidiocan',
    barangay: 'Cambajao',
    coordinates: { lat: 12.3785, lng: 122.5432 },
    isActive: true,
    photos: [
        {
            _id: 'photo-1',
            url: '/api/files/607f1f77bcf86cd799439012/cambajao-river-1.jpg',
            filename: 'cambajao-river-1.jpg',
            originalName: 'River bank landslide approach',
            displayOrder: 0,
            uploadedAt: '2026-08-25T10:00:00Z',
        },
        {
            _id: 'photo-2',
            url: '/api/files/607f1f77bcf86cd799439013/cambajao-river-2.jpg',
            filename: 'cambajao-river-2.jpg',
            originalName: 'Bridge substructure erosion',
            displayOrder: 1,
            uploadedAt: '2026-08-25T10:05:00Z',
        },
    ],
};

const mockZoneWithoutPhotos = {
    _id: 'zone-magdiwang-1',
    name: 'Magdiwang Highway Curve',
    description: 'Blind sharp curve with limited sightlines.',
    type: 'accident_prone',
    severity: 'medium',
    radius: 100,
    municipality: 'Magdiwang',
    barangay: 'Poblacion',
    photos: [],
};

import { clearBlobCache } from '../utils/blobCache';

describe('HighRiskZoneDetails Component', () => {
    beforeEach(() => {
        clearBlobCache();
        vi.clearAllMocks();
        globalThis.URL.createObjectURL = vi.fn((blob) => `blob:mock-url-${blob?.size || 'file'}`);
        globalThis.URL.revokeObjectURL = vi.fn();
        filesAPIMock.getProtected.mockResolvedValue({
            data: new Blob(['mock-image-data'], { type: 'image/jpeg' }),
        });
    });

    test('1. Renders complete visual hierarchy: severity badge, jurisdiction, hazard type, coverage radius, and description', async () => {
        render(<HighRiskZoneDetails zone={mockZoneWithPhotos} viewerRole="guest" />);

        expect(screen.getByText('High severity')).toBeInTheDocument();
        expect(screen.getByText('Cajidiocan · Cambajao')).toBeInTheDocument();
        expect(screen.getByText('Active zone')).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 3, name: 'Cambajao River Flash Flood Zone' })).toBeInTheDocument();
        expect(screen.getByText(/Prone to rapid river overflow/i)).toBeInTheDocument();
        expect(screen.getByText('Landslide prone')).toBeInTheDocument();
        expect(screen.getByText('180 m radius')).toBeInTheDocument();
        expect(screen.getByText('12.3785° N, 122.5432° E')).toBeInTheDocument();

        await screen.findByRole('button', { name: /View reference photo 1:/i });
    });

    test('2. Renders Field reference section with photo count and thumbnail previews', async () => {
        render(<HighRiskZoneDetails zone={mockZoneWithPhotos} viewerRole="guest" />);

        expect(screen.getByRole('heading', { level: 4, name: 'Field reference' })).toBeInTheDocument();
        expect(screen.getByText('2 photos')).toBeInTheDocument();

        await waitFor(() => {
            expect(filesAPIMock.getProtected).toHaveBeenCalledWith(
                '/api/files/607f1f77bcf86cd799439012/cambajao-river-1.jpg',
                expect.any(Object)
            );
            expect(filesAPIMock.getProtected).toHaveBeenCalledWith(
                '/api/files/607f1f77bcf86cd799439013/cambajao-river-2.jpg',
                expect.any(Object)
            );
        });

        const photo1Button = screen.getByRole('button', {
            name: /View reference photo 1: River bank landslide approach/i,
        });
        const photo2Button = screen.getByRole('button', {
            name: /View reference photo 2: Bridge substructure erosion/i,
        });

        expect(photo1Button).toBeInTheDocument();
        expect(photo2Button).toBeInTheDocument();
        expect(screen.getByText('#1')).toBeInTheDocument();
        expect(screen.getByText('#2')).toBeInTheDocument();
    });

    test('3. Clicking a thumbnail opens the shared ImageViewer modal with all photos in the zone', async () => {
        render(<HighRiskZoneDetails zone={mockZoneWithPhotos} viewerRole="guest" />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /View reference photo 1:/i })).toBeInTheDocument();
        });

        const photo1Button = screen.getByRole('button', { name: /View reference photo 1:/i });
        fireEvent.click(photo1Button);

        // ImageViewer dialog mounts
        const dialog = await screen.findByRole('dialog', { name: /Enlarged evidence image viewer/i });
        expect(dialog).toBeInTheDocument();

        // Displays count indicator in viewer header with context-aware entityLabel
        expect(screen.getByText('Field reference 1 of 2')).toBeInTheDocument();

        // Next button navigates to Photo 2
        const nextButtons = screen.getAllByRole('button', { name: /Next field reference/i });
        expect(nextButtons.length).toBeGreaterThan(0);
        fireEvent.click(nextButtons[0]);
        expect(screen.getByText('Field reference 2 of 2')).toBeInTheDocument();

        // Close viewer
        const closeButton = screen.getByRole('button', { name: /Close image viewer/i });
        fireEvent.click(closeButton);

        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: /Enlarged evidence image viewer/i })).not.toBeInTheDocument();
        });
    });

    test('4. Renders graceful empty state when a zone has no photos attached', () => {
        render(<HighRiskZoneDetails zone={mockZoneWithoutPhotos} viewerRole="guest" />);

        expect(screen.getByText('0 photos')).toBeInTheDocument();
        expect(screen.getByText('No reference photos attached for this hazard zone.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /View reference photo/i })).not.toBeInTheDocument();
    });

    test('5. Renders graceful error placeholder if a photo fails to load', async () => {
        filesAPIMock.getProtected.mockRejectedValueOnce(new Error('Network error'));

        render(<HighRiskZoneDetails zone={mockZoneWithPhotos} viewerRole="guest" />);

        await waitFor(() => {
            expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
        });
    });

    test('6. Renders Google Maps external link clearly separated as secondary action', async () => {
        render(<HighRiskZoneDetails zone={mockZoneWithPhotos} viewerRole="guest" />);

        const googleMapsLink = screen.getByRole('link', { name: /Open in Google Maps/i });
        expect(googleMapsLink).toBeInTheDocument();
        expect(googleMapsLink).toHaveAttribute(
            'href',
            'https://www.google.com/maps?q=12.3785,122.5432'
        );
        expect(googleMapsLink).toHaveAttribute('target', '_blank');
        expect(googleMapsLink).toHaveAttribute('rel', 'noopener noreferrer');

        await screen.findByRole('button', { name: /View reference photo 1:/i });
    });

    test('7. Single reference photo does not render #1 badge on thumbnail and uses clean preview header in Lightbox', async () => {
        const singlePhotoZone = {
            ...mockZoneWithPhotos,
            photos: [
                {
                    _id: 'single-photo-1',
                    url: '/api/files/607f1f77bcf86cd799439012/cambajao-river-1.jpg',
                    filename: 'cambajao-river-1.jpg',
                    originalName: 'Field reference preview',
                    displayOrder: 0,
                    uploadedAt: '2026-08-25T10:00:00Z',
                },
            ],
        };

        render(<HighRiskZoneDetails zone={singlePhotoZone} viewerRole="guest" />);

        expect(screen.getByText('1 photo')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /View reference photo 1:/i })).toBeInTheDocument();
        });

        // Does NOT render #1 badge overlay
        expect(screen.queryByText('#1')).not.toBeInTheDocument();

        // Open Lightbox
        const photoBtn = screen.getByRole('button', { name: /View reference photo 1:/i });
        fireEvent.click(photoBtn);

        // Lightbox displays clean string instead of "Evidence photo 1"
        expect(screen.getByText('Field reference preview')).toBeInTheDocument();
        expect(screen.queryByText('Evidence photo 1')).not.toBeInTheDocument();
    });
});
