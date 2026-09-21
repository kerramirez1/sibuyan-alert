import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    mockRemoveZone,
    mockUseGlobalHighRiskZones,
    mockToast,
    mockMapViewProps,
    mockHighRiskZonesAPI,
} = vi.hoisted(() => ({
    mockRefresh: vi.fn(),
    mockRemoveZone: vi.fn(),
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
        // The hazard reference layers resolve asynchronously on mount, so they
        // have to be present on the mock or the page would be tested only on the
        // failure path.
        getHazardLayers: vi.fn().mockResolvedValue({
            data: {
                data: {
                    layers: [
                        {
                            datasetId: 'landslide',
                            hazardType: 'landslide',
                            label: 'Landslide',
                            shortLabel: 'Landslide',
                            attribution: 'DOST Project NOAH / PHIVOLCS',
                            licence: 'ODC-ODbL',
                            classes: [{ value: 2, label: 'Medium' }, { value: 3, label: 'High' }],
                            features: [
                                { type: 'Feature', properties: { haz: 3 }, geometry: { type: 'MultiPolygon', coordinates: [] } },
                                { type: 'Feature', properties: { haz: 2 }, geometry: { type: 'MultiPolygon', coordinates: [] } },
                            ],
                        },
                    ],
                    unavailable: [],
                },
            },
        }),
        getHazardLayer: vi.fn().mockResolvedValue({ data: { data: { features: [] } } }),
        getHazardsAt: vi.fn().mockResolvedValue({
            data: { data: { available: true, reason: 'clear', results: [] } },
        }),
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
                    // The geocode response carries hazard readings alongside
                    // jurisdiction, so one round-trip answers both questions.
                    hazards: {
                        available: true,
                        reason: 'in_hazard',
                        results: [
                            {
                                datasetId: 'landslide',
                                hazardType: 'landslide',
                                hazardClass: 3,
                                hazardLabel: 'High',
                                classDescription: 'No dwelling zone',
                                suggestedZoneType: 'landslide_prone',
                                source: 'DOST Project NOAH / PHIVOLCS',
                                licence: 'ODC-ODbL',
                            },
                        ],
                    },
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
            removeZone: mockRemoveZone,
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
            // Six decimals: the readout was widened from four (~11 m) so the
            // displayed precision matches the placement precision.
            expect(screen.getByText(/Location selected: 12\.378500, 122\.543200/i)).toBeInTheDocument();
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

    test('removes a deleted zone locally instead of waiting on the refetch', async () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<AdminHighRiskZonesPage />);

        fireEvent.click(screen.getByRole('button', { name: 'Delete Cambajao River Overflow' }));

        await waitFor(() => {
            expect(mockHighRiskZonesAPI.delete).toHaveBeenCalledWith('zone-1');
        });

        // Dropping it locally is what makes the row and its map marker leave the
        // moment the server confirms. Relying on the refetch alone is what kept
        // resurrecting it: the list was served with `max-age=120`, so the refetch
        // was answered from the browser's HTTP cache with the deleted zone still
        // in it, however many times the admin pressed Delete.
        expect(mockRemoveZone).toHaveBeenCalledWith('zone-1');
        expect(mockRefresh).toHaveBeenCalled();
        expect(mockToast.success).toHaveBeenCalledWith('Zone deleted');

        confirmSpy.mockRestore();
    });

    test('offers only the zone types the workspace still supports', () => {
        render(<AdminHighRiskZonesPage />);

        fireEvent.click(screen.getByRole('button', { name: /Add zone/i }));
        const group = screen.getByRole('radiogroup', { name: 'Zone type' });

        expect(within(group).getAllByRole('radio')).toHaveLength(3);
        expect(within(group).getByRole('radio', { name: /Landslide Prone/i })).toBeInTheDocument();
        expect(within(group).getByRole('radio', { name: /Accident Prone/i })).toBeInTheDocument();
        expect(within(group).getByRole('radio', { name: /Other Hazard/i })).toBeInTheDocument();
        // Withdrawn: it must not be selectable, not merely unlabelled.
        expect(within(group).queryByRole('radio', { name: /Flood/i })).not.toBeInTheDocument();
    });

    test('keeps every zone-type label on one line, sized to its own column', () => {
        render(<AdminHighRiskZonesPage />);

        fireEvent.click(screen.getByRole('button', { name: /Add zone/i }));
        const group = screen.getByRole('radiogroup', { name: 'Zone type' });

        // The row is its own container and the labels are sized from it. Two
        // earlier attempts are the reason this is pinned down: wrapping made the
        // row two lines tall and read as six options, and trimming to an ellipsis
        // hid the word that distinguishes them ("Landslide" vs "Accident"). A
        // viewport breakpoint cannot do the job either — this form is a rail on a
        // wide desktop, so the column and the viewport disagree.
        expect(group.className).toContain('[container-type:inline-size]');

        for (const label of ['Landslide Prone', 'Accident Prone', 'Other Hazard']) {
            const text = within(group).getByText(label);
            expect(text.className).toContain('whitespace-nowrap');
            expect(text.className).toContain('[font-size:clamp(');
        }
    });

    test('offers only the two severities the workspace still supports', () => {
        render(<AdminHighRiskZonesPage />);

        fireEvent.click(screen.getByRole('button', { name: /Add zone/i }));
        const group = screen.getByRole('radiogroup', { name: 'Severity level' });

        expect(within(group).getAllByRole('radio')).toHaveLength(2);
        expect(within(group).getByRole('radio', { name: /Medium/i })).toBeInTheDocument();
        expect(within(group).getByRole('radio', { name: /High/i })).toBeInTheDocument();
        expect(within(group).queryByRole('radio', { name: /Low/i })).not.toBeInTheDocument();
        expect(within(group).queryByRole('radio', { name: /Critical/i })).not.toBeInTheDocument();
    });

    test('still names a legacy flood zone it can no longer create', () => {
        mockUseGlobalHighRiskZones.mockReturnValue({
            zones: [...mockZones, {
                _id: 'zone-legacy',
                name: 'Sibuyan River Flooding',
                type: 'flood_prone',
                severity: 'critical',
                radius: 200,
                municipality: 'Cajidiocan',
                coordinates: { lat: 12.3712, lng: 122.5301 },
                isActive: true,
                photos: [],
            }],
            loading: false,
            refresh: mockRefresh,
            removeZone: mockRemoveZone,
        });

        render(<AdminHighRiskZonesPage />);

        // The label has to survive even though the option is gone: a zone the
        // list cannot name is a zone the administrator cannot find or fix.
        expect(screen.getByText(/Flood Prone · Cajidiocan/)).toBeInTheDocument();
        expect(screen.getByText('Critical')).toBeInTheDocument();
    });

    test('refuses to save a legacy zone until its withdrawn values are replaced', async () => {
        mockUseGlobalHighRiskZones.mockReturnValue({
            zones: [{
                _id: 'zone-legacy',
                name: 'Sibuyan River Flooding',
                type: 'flood_prone',
                severity: 'low',
                radius: 200,
                municipality: 'Cajidiocan',
                coordinates: { lat: 12.3712, lng: 122.5301 },
                isActive: true,
                photos: [],
            }],
            loading: false,
            refresh: mockRefresh,
            removeZone: mockRemoveZone,
        });

        render(<AdminHighRiskZonesPage />);
        fireEvent.click(screen.getByRole('button', { name: 'Edit Sibuyan River Flooding' }));

        // The stored values are loaded as they are — not silently coerced to a
        // supported type, which would re-classify the zone on a mere open — and
        // the form says out loud what it will not save.
        expect(screen.getByRole('status')).toHaveTextContent(/Flood Prone and Low/);
        expect(screen.queryByRole('radio', { name: /Flood/i })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Update zone/i }));

        expect(mockHighRiskZonesAPI.update).not.toHaveBeenCalled();
        expect(mockToast.error).toHaveBeenCalledWith(expect.stringContaining('Flood Prone and Low'));

        // Replacing both is what unblocks it.
        fireEvent.click(screen.getByRole('radio', { name: /Accident Prone/i }));
        fireEvent.click(screen.getByRole('radio', { name: /High/i }));
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Update zone/i }));

        await waitFor(() => {
            expect(mockHighRiskZonesAPI.update).toHaveBeenCalledWith('zone-legacy', expect.any(FormData));
        });
        const payload = mockHighRiskZonesAPI.update.mock.calls.at(-1)[1];
        expect(payload.get('type')).toBe('accident_prone');
        expect(payload.get('severity')).toBe('high');
    });

    test('keeps a zone it is not allowed to delete', async () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<AdminHighRiskZonesPage />);

        // The second fixture belongs to Magdiwang; this admin manages Cajidiocan.
        // The row offers no Delete at all, so the guard is the UI itself.
        expect(screen.queryByRole('button', { name: 'Delete Magdiwang Highway Curve' })).not.toBeInTheDocument();
        expect(mockHighRiskZonesAPI.delete).not.toHaveBeenCalled();
        expect(mockRemoveZone).not.toHaveBeenCalled();

        confirmSpy.mockRestore();
    });

    test('hands the hazard layers to the map switched off, and offers them as controls', async () => {
        render(<AdminHighRiskZonesPage />);

        await waitFor(() => {
            expect(mockMapViewProps).toHaveBeenCalledWith(
                expect.objectContaining({
                    hazardLayers: expect.arrayContaining([
                        expect.objectContaining({ datasetId: 'landslide', hazardType: 'landslide' }),
                    ]),
                    // The layers arrive intact and the map opens clean: the viewer
                    // has asked for no class of them yet.
                    hazardClassVisibility: {},
                })
            );
        });

        // The control is also the legend, built from the layers actually on the
        // map — an absent layer cannot be advertised as present — and every class
        // is offered unchecked, in its own colour, so the key to what could be
        // drawn survives the map opening without it. Scoped to the map workspace:
        // "Medium" also appears as a severity badge in the zone list.
        const mapWorkspace = screen.getByLabelText('High-risk zones map workspace');
        expect(await within(mapWorkspace).findByRole('switch', { name: 'Medium Landslide Susceptibility' }))
            .toHaveAttribute('aria-checked', 'false');
        expect(within(mapWorkspace).getByRole('switch', { name: 'High Landslide Susceptibility' }))
            .toHaveAttribute('aria-checked', 'false');
        // Storm surge is no longer registered, so no switch may offer it.
        expect(within(mapWorkspace).queryByRole('switch', { name: /surge|SSA/i })).not.toBeInTheDocument();
        expect(within(mapWorkspace).getByText(/ODC-ODbL/)).toBeInTheDocument();
    });

    test('switches each susceptibility class independently, without reloading the map', async () => {
        render(<AdminHighRiskZonesPage />);

        const mapWorkspace = screen.getByLabelText('High-risk zones map workspace');
        const medium = await within(mapWorkspace).findByRole('switch', { name: 'Medium Landslide Susceptibility' });
        const high = within(mapWorkspace).getByRole('switch', { name: 'High Landslide Susceptibility' });
        const visibility = () => mockMapViewProps.mock.lastCall[0].hazardClassVisibility;

        // Medium alone.
        fireEvent.click(medium);
        await waitFor(() => expect(visibility()).toEqual({ landslide: [2] }));
        expect(medium).toHaveAttribute('aria-checked', 'true');
        expect(high).toHaveAttribute('aria-checked', 'false');

        // Both at once.
        fireEvent.click(high);
        await waitFor(() => expect(visibility()).toEqual({ landslide: [2, 3] }));

        // High alone — switching one off must not disturb the other.
        fireEvent.click(medium);
        await waitFor(() => expect(visibility()).toEqual({ landslide: [3] }));
        expect(medium).toHaveAttribute('aria-checked', 'false');
        expect(high).toHaveAttribute('aria-checked', 'true');

        // And back to the clean map the page opens with.
        fireEvent.click(high);
        await waitFor(() => expect(visibility()).toEqual({ landslide: [] }));
        expect(high).toHaveAttribute('aria-checked', 'false');
    });

    test('enables the placement accuracy aids while the zone form is open', async () => {
        render(<AdminHighRiskZonesPage />);

        // Closed form: no cursor readout, because nothing is being placed.
        expect(mockMapViewProps).toHaveBeenLastCalledWith(
            expect.objectContaining({ showCursorCoordinates: false })
        );

        fireEvent.click(screen.getByRole('button', { name: /Add zone/i }));

        await waitFor(() => {
            expect(mockMapViewProps).toHaveBeenLastCalledWith(
                expect.objectContaining({ showCursorCoordinates: true })
            );
        });
    });

    test('shows the hazard reading for the selected pin in the form', async () => {
        render(<AdminHighRiskZonesPage />);

        fireEvent.click(screen.getByRole('button', { name: /Add zone/i }));
        fireEvent.click(screen.getByText('Select mock map point'));

        // The reading is rendered as one chip per layer, so a point that is high
        // landslide and clear storm surge keeps both facts visible.
        await waitFor(() => {
            expect(screen.getByText(/^High landslide$/)).toBeInTheDocument();
        });
    });

    test('adopts the suggested zone type when the pin lands in a high hazard', async () => {
        render(<AdminHighRiskZonesPage />);

        fireEvent.click(screen.getByRole('button', { name: /Add zone/i }));
        fireEvent.click(screen.getByText('Select mock map point'));

        // The geocode fixture reports high landslide with a suggestion, so the
        // form's untouched default is replaced — and the toast says so, because
        // a silent change would look like a bug.
        await waitFor(() => {
            expect(screen.getByText(/High landslide/i)).toBeInTheDocument();
        });
        expect(screen.getByRole('radio', { name: /Landslide Prone/i })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('radio', { name: /Accident Prone/i })).toHaveAttribute('aria-checked', 'false');
        expect(mockToast.success).toHaveBeenCalledWith(
            expect.stringContaining('Zone type set to landslide prone'),
            expect.anything()
        );
    });

    test('says the hazard could not be checked when no reading is available', async () => {
        // A missing or failed hazard lookup must read as unknown, never as safe.
        const { reportsAPI } = await import('../services/api');
        reportsAPI.geocodeLocation.mockResolvedValueOnce({
            data: {
                data: {
                    coordinates: { lat: 12.3785, lng: 122.5432 },
                    isWithinSibuyanBounds: true,
                    barangayAssignment: 'matched',
                    municipalityAssignment: 'matched',
                    barangay: { name: 'Cambajao' },
                    municipality: { name: 'Cajidiocan' },
                    displayAddress: 'Cambajao, Cajidiocan, Romblon',
                    hazards: { available: false, reason: 'dataset_missing', results: [] },
                },
            },
        });

        render(<AdminHighRiskZonesPage />);
        fireEvent.click(screen.getByRole('button', { name: /Add zone/i }));
        fireEvent.click(screen.getByText('Select mock map point'));

        await waitFor(() => {
            expect(screen.getByText(/Hazard: could not be checked/i)).toBeInTheDocument();
        });
    });
});
