import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockZones = [
    {
        _id: 'zone-1',
        name: 'Cambajao River Overflow',
        description: 'Prone to flash floods during heavy rains',
        type: 'landslide_prone',
        severity: 'high',
        radius: 150,
        municipality: 'Cajidiocan',
        coordinates: { lat: 12.3785, lng: 122.5432 },
        isActive: true,
        photos: [
            {
                url: '/api/files/607f1f77bcf86cd799439012/hazard1.png',
                filename: 'hazard1.png',
                displayOrder: 0,
            },
        ],
    },
    {
        _id: 'zone-2',
        name: 'Magdiwang Highway Curve',
        description: 'Sharp blind curve near bridge',
        type: 'accident_prone',
        severity: 'medium',
        radius: 100,
        municipality: 'Magdiwang',
        coordinates: { lat: 12.4821, lng: 122.5189 },
        isActive: true,
        photos: [],
    },
];

const {
    mockRefresh,
    mockUseGlobalHighRiskZones,
    mockToast,
    mockMapViewProps,
    mockHighRiskZonesAPI,
} = vi.hoisted(() => ({
    mockRefresh: vi.fn(),
    mockUseGlobalHighRiskZones: vi.fn(),
    mockToast: {
        error: vi.fn(),
        success: vi.fn(),
        loading: vi.fn(),
        dismiss: vi.fn(),
    },
    mockMapViewProps: vi.fn(),
    mockHighRiskZonesAPI: {
        create: vi.fn().mockResolvedValue({ data: { success: true } }),
        update: vi.fn().mockResolvedValue({ data: { success: true } }),
        delete: vi.fn().mockResolvedValue({ data: { success: true } }),
    },
}));

vi.mock('../hooks/useGlobalHighRiskZones', () => ({
    default: () => mockUseGlobalHighRiskZones(),
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
    }),
}));

vi.mock('../utils/appToast', () => ({
    default: mockToast,
}));

vi.mock('../components/map/MapView', () => ({
    default: (props) => {
        mockMapViewProps(props);
        return (
            <div data-testid="map-view">
                <span>Map preview</span>
                {props.onLocationSelect && (
                    <button
                        type="button"
                        onClick={() => props.onLocationSelect({ lat: 12.3785, lng: 122.5432 })}
                    >
                        Select mock map point
                    </button>
                )}
            </div>
        );
    },
}));

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }) => <>{children}</>,
    motion: {
        div: ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }) => <div {...props}>{children}</div>,
        section: ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }) => <section {...props}>{children}</section>,
    },
}));

vi.mock('../services/api', () => ({
    highRiskZonesAPI: mockHighRiskZonesAPI,
    reportsAPI: {
        geocodeLocation: vi.fn().mockResolvedValue({
            data: {
                data: {
                    coordinates: { lat: 12.3785, lng: 122.5432 },
                    isWithinSibuyanBounds: true,
                    barangayAssignment: 'matched',
                    municipalityAssignment: 'matched',
                    barangay: { name: 'Cambajao' },
                    municipality: { name: 'Cajidiocan' },
                    displayAddress: 'Cambajao, Cajidiocan, Romblon',
                },
            },
        }),
    },
}));

import AdminHighRiskZonesPage from '../pages/AdminHighRiskZonesPage';

describe('AdminHighRiskZonesPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.URL.createObjectURL = vi.fn((file) => `blob:http://localhost/${file.name}`);
        globalThis.URL.revokeObjectURL = vi.fn();
        mockUseGlobalHighRiskZones.mockReturnValue({
            zones: mockZones,
            loading: false,
            refresh: mockRefresh,
        });
    });

    test('renders page header, status pill, map workspace, and marked zones list', () => {
        render(<AdminHighRiskZonesPage />);

        expect(screen.getByText('High-risk zones')).toBeInTheDocument();
        // The page's subject is its h1 and it prints nothing: a screen reader
        // announces it and headings navigation finds it, while the band at the
        // top spends its lines on the eyebrow and the municipality the line
        // below names instead.
        const pageHeading = screen.getByRole('heading', { level: 1, name: 'High-risk zone management' });
        expect(pageHeading).toHaveClass('sr-only');
        expect(pageHeading.className).not.toContain('text-2xl');
        expect(pageHeading.className).not.toContain('sm:text-3xl');
        expect(screen.getByText(/View mapped hazards and manage zones for Cajidiocan\./i)).toBeInTheDocument();
        expect(screen.getByText(/Sibuyan Island · Alert System Active/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Add zone/i })).toBeInTheDocument();

        expect(screen.getByRole('region', { name: 'High-risk zones map workspace' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'High-risk zones map' })).toBeInTheDocument();

        expect(screen.getByRole('region', { name: 'Marked high-risk zones' })).toBeInTheDocument();
        expect(screen.getByText('Marked zones (2)')).toBeInTheDocument();
        expect(screen.getByText('Cambajao River Overflow')).toBeInTheDocument();
        expect(screen.getByText('Magdiwang Highway Curve')).toBeInTheDocument();

        // MapView configured specifically for hazard zones
        expect(mockMapViewProps).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: 'risk-zones',
                highRiskZones: mockZones,
            })
        );

        // Check view-only vs editable zones
        expect(screen.getByRole('button', { name: 'Edit Cambajao River Overflow' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete Cambajao River Overflow' })).toBeInTheDocument();
        expect(screen.getByText('View only')).toBeInTheDocument();
    });

    test('spends two header lines, so the workspace keeps the rest of the viewport', () => {
        render(<AdminHighRiskZonesPage />);

        // The stage below the header is `flex-1`: whatever the header claims in
        // height it takes from the map and the zone list. The live status is
        // therefore grouped with the title on one row instead of owning a third
        // line. Re-stacking it costs ~20px of map on every screen, which is the
        // regression this pins down.
        const title = screen.getByText('High-risk zones');
        const status = screen.getByText(/Sibuyan Island · Alert System Active/i);
        const titleRow = title.parentElement;
        expect(titleRow.contains(status)).toBe(true);

        // The description still owns the line under them — it is a sibling of
        // their row, not a third member of it.
        const description = screen.getByText(/View mapped hazards and manage zones for Cajidiocan\./i);
        expect(titleRow.contains(description)).toBe(false);
        expect(description.parentElement.contains(title)).toBe(true);
    });

    test('fills the shell it is given instead of re-deriving the app chrome', () => {
        const { container } = render(<AdminHighRiskZonesPage />);

        // This page must not scroll as a whole, so its height is pinned to the
        // box MainLayout hands it. It previously reconstructed that box by hand
        // as `calc(100dvh - 7.25rem)` with a 480px floor: true only while the
        // header height, main's padding and the window all stayed large enough,
        // and on a shorter window the floor won and the page scrolled — the one
        // behaviour this workspace must never have. `h-full` cannot overshoot.
        const page = container.firstElementChild;
        expect(page).toHaveClass('lg:h-full');
        expect(page.className).not.toMatch(/100dvh|min-h-\[/);
    });

    test('opens zone creation form with reference photos section and allows cancelling', () => {
        render(<AdminHighRiskZonesPage />);

        fireEvent.click(screen.getByRole('button', { name: /Add zone/i }));

        expect(screen.getByRole('heading', { name: 'Add high-risk zone' })).toBeInTheDocument();
        expect(screen.getByLabelText(/Zone name/i)).toBeInTheDocument();
        expect(screen.getByRole('radiogroup', { name: 'Zone type' })).toBeInTheDocument();
        expect(screen.getByRole('radiogroup', { name: 'Severity level' })).toBeInTheDocument();
        expect(screen.getByLabelText(/Radius \(meters\)/i)).toBeInTheDocument();
        expect(screen.getByText('0/5 photos')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Attach reference photos' })).toBeInTheDocument();
        expect(screen.getByText(/JPEG, PNG, WebP up to 5 MB each/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create zone' })).toBeDisabled();

        // Cancel returns to list
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.getByRole('region', { name: 'Marked high-risk zones' })).toBeInTheDocument();
    });

    test('allows attaching reference photos, displaying previews, reordering and removing photos', async () => {
        render(<AdminHighRiskZonesPage />);

        fireEvent.click(screen.getByRole('button', { name: /Add zone/i }));

        const fileInput = screen.getByLabelText('Upload reference photos');
        const fileA = new File(['image-data-1'], 'hazard-a.png', { type: 'image/png' });
        const fileB = new File(['image-data-2'], 'hazard-b.jpg', { type: 'image/jpeg' });

        fireEvent.change(fileInput, { target: { files: [fileA, fileB] } });

        expect(screen.getByText('2/5 photos')).toBeInTheDocument();
        expect(screen.getByAltText('Hazard reference photo 1')).toBeInTheDocument();
        expect(screen.getByAltText('Hazard reference photo 2')).toBeInTheDocument();
        expect(screen.getByText('#1')).toBeInTheDocument();
        expect(screen.getByText('#2')).toBeInTheDocument();

        // Reorder photos: move photo 1 right
        const moveRightBtn = screen.getByRole('button', { name: 'Move photo 1 right' });
        fireEvent.click(moveRightBtn);

        // Remove a photo
        const removeButtons = screen.getAllByRole('button', { name: /Remove reference photo/i });
        fireEvent.click(removeButtons[0]);

        expect(screen.getByText('1/5 photos')).toBeInTheDocument();
        expect(globalThis.URL.revokeObjectURL).toHaveBeenCalled();
    });

    test('validates file size and image file type for reference photos', () => {
        render(<AdminHighRiskZonesPage />);

        fireEvent.click(screen.getByRole('button', { name: /Add zone/i }));

        const fileInput = screen.getByLabelText('Upload reference photos');

        // Invalid file type
        const textFile = new File(['text'], 'report.txt', { type: 'text/plain' });
        fireEvent.change(fileInput, { target: { files: [textFile] } });
        expect(mockToast.error).toHaveBeenCalledWith('report.txt is not an image');

        // Oversized file (> 5 MB)
        const oversizedFile = new File([new ArrayBuffer(6 * 1024 * 1024)], 'huge.png', {
            type: 'image/png',
        });
        fireEvent.change(fileInput, { target: { files: [oversizedFile] } });
        expect(mockToast.error).toHaveBeenCalledWith('huge.png is too large (max 5MB)');
    });

    test('populates editor when clicking edit on an assigned zone', () => {
        render(<AdminHighRiskZonesPage />);

        fireEvent.click(screen.getByRole('button', { name: 'Edit Cambajao River Overflow' }));

        expect(screen.getByRole('heading', { name: 'Edit high-risk zone' })).toBeInTheDocument();
        expect(screen.getByLabelText(/Zone name/i)).toHaveValue('Cambajao River Overflow');
        expect(screen.getByLabelText(/Radius \(meters\)/i)).toHaveValue(150);
        expect(screen.getByText('1/5 photos')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Update zone' })).toBeInTheDocument();

        // Close button exits editor
        fireEvent.click(screen.getByRole('button', { name: 'Close zone editor' }));
        expect(screen.getByRole('region', { name: 'Marked high-risk zones' })).toBeInTheDocument();
    });

    test('allows selecting location, attaching photos, and submitting multipart form', async () => {
        render(<AdminHighRiskZonesPage />);

        fireEvent.click(screen.getByRole('button', { name: /Add zone/i }));

        const nameInput = screen.getByLabelText(/Zone name/i);
        fireEvent.change(nameInput, { target: { value: 'New Landslide Hazard' } });

        // Attach reference photo
        const fileInput = screen.getByLabelText('Upload reference photos');
        const photoFile = new File(['img'], 'hazard.png', { type: 'image/png' });
        fireEvent.change(fileInput, { target: { files: [photoFile] } });

        // Select point on map
        fireEvent.click(screen.getByText('Select mock map point'));

        await waitFor(() => {
            expect(screen.getByText(/Location selected: 12.3785, 122.5432/i)).toBeInTheDocument();
        });

        const submitBtn = screen.getByRole('button', { name: 'Create zone' });
        expect(submitBtn).toBeEnabled();
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(mockHighRiskZonesAPI.create).toHaveBeenCalledWith(expect.any(FormData));
            expect(mockRefresh).toHaveBeenCalled();
            expect(mockToast.success).toHaveBeenCalledWith('High-risk zone created');
        });
    });
});
