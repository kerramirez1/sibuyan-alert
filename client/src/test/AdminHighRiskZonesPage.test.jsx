import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
        // The accident-prone layer resolves asynchronously like the hazard
        // layers, so it has to be present on the mock too — otherwise the page
        // would only ever be tested on the failure path.
        getAccidentHotspots: vi.fn(),
    },
}));

vi.mock('../context/SocketContext', () => ({
    useSocket: () => ({ subscribe: vi.fn(() => vi.fn()), reconnectVersion: 0 }),
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
        const isPhone = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 639px)').matches;
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
                {typeof props.onToggleExpand === 'function' && (props.isExpanded || !isPhone) && (
                    <button
                        type="button"
                        aria-label={props.isExpanded ? 'Exit expanded map' : 'Expand map'}
                        onClick={props.onToggleExpand}
                    >
                        {props.isExpanded ? 'Exit expanded map' : 'Expand map'}
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
import { setCachedData } from '../utils/queryCache';
import { ACCIDENT_HOTSPOTS_CACHE_KEY } from '../hooks/useAccidentHotspots';

const hotspotCell = (classValue, count, coordinates) => ({
    type: 'Feature',
    properties: { class: classValue, count },
    geometry: { type: 'Point', coordinates },
});
const ACCIDENT_RULE = Object.freeze({
    radiusMeters: 100,
    windowDays: 30,
    mediumMinReports: 3,
    highMinReports: 6,
});

/** The normalized layer as the hook stores it in the query cache. */
const hotspotLayer = (features, rule = ACCIDENT_RULE) => ({
    datasetId: 'accident_hotspots',
    label: 'Accident-prone',
    source: 'Sibuyan Alert accident reports',
    derivedFromReports: true,
    method: 'radius_cluster',
    rule,
    classes: [{ value: 2, label: 'Medium' }, { value: 3, label: 'High' }],
    features,
    totals: {
        reports: features.reduce((total, entry) => total + entry.properties.count, 0),
        hotspots: features.length,
        clusteredReports: features.reduce((total, entry) => total + entry.properties.count, 0),
    },
});

const accidentPayload = (features, rule = ACCIDENT_RULE) => ({
    data: { data: hotspotLayer(features, rule) },
});

/** One Medium hotspot: three validated reports inside one 100 m area. */
const MEDIUM_HOTSPOT = [hotspotCell(2, 3, [122.676219, 12.345053])];

/**
 * Puts the layer on screen before the first render.
 *
 * These tests are about what the control does with a derived layer, and a layer
 * that arrives one microtask later than the render makes every assertion here a
 * `waitFor` on a request that is not the subject. The fetch and cache paths have
 * their own tests in `useAccidentHotspots.test.jsx`; this seeds the snapshot the
 * hook renders from, and leaves the request mock in place as the fallback for a
 * cache the hook considers stale.
 */
const seedAccidentHotspots = (features = MEDIUM_HOTSPOT, rule = ACCIDENT_RULE) => {
    mockHighRiskZonesAPI.getAccidentHotspots.mockResolvedValue(accidentPayload(features, rule));
    setCachedData(ACCIDENT_HOTSPOTS_CACHE_KEY, hotspotLayer(features, rule));
};

/**
 * The radius the form is actually carrying.
 *
 * Read by id rather than by text because the readout and the band's lower end can
 * print the same string ("50 m"), and at that value a text query would be asking
 * two elements which one is which.
 */
const radiusReadout = () => document.getElementById('risk-zone-radius-value')?.textContent;

/**
 * Opens the map's collapsed Layers control and returns its panel.
 *
 * The switches moved inside the popover — that is the point of the control, one
 * line of header instead of a block of chips — so a test about toggling a layer
 * has to do the thing an operator does first. Handing back the panel keeps the
 * scoping explicit: the same "Medium" also appears as a severity badge in the
 * zone list, and a page-wide query would find the wrong one.
 */
const openLayerControl = async (mapWorkspace) => {
    fireEvent.click(within(mapWorkspace).getByRole('button', { name: /Layers/i }));
    return within(mapWorkspace).findByRole('group', { name: 'Map layers' });
};

describe('AdminHighRiskZonesPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        seedAccidentHotspots();
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

        const pageHeading = screen.getByRole('heading', { level: 1, name: 'High-risk zone management' });
        expect(pageHeading).toBeVisible();
        expect(pageHeading).not.toHaveClass('sr-only');
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
        const title = screen.getByRole('heading', { level: 1, name: 'High-risk zone management' });
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
        expect(screen.getByLabelText('Zone type')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Accident Prone/i })).toHaveAttribute('aria-haspopup', 'listbox');
        expect(screen.getByRole('radiogroup', { name: 'Severity level' })).toBeInTheDocument();
        expect(screen.getByLabelText(/^Radius$/i)).toBeInTheDocument();
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
        // The stored radius opens on the slider, in the band the form offers.
        expect(screen.getByLabelText(/^Radius$/i)).toHaveValue('150');
        expect(screen.getByText('150 m')).toBeInTheDocument();
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
        const select = screen.getByLabelText('Zone type');
        const options = within(select).getAllByRole('option');

        expect(options).toHaveLength(3);
        expect(options.map((option) => option.textContent)).toEqual([
            'Landslide Prone',
            'Accident Prone',
            'Other Hazard',
        ]);
        // Withdrawn: it must not be selectable, not merely unlabelled. The hidden
        // native select is what the form submits and what a screen reader reads,
        // so an option missing from it is an option that cannot be chosen.
        expect(within(select).queryByRole('option', { name: /Flood/i })).not.toBeInTheDocument();
    });

    test('does not include Flood in the hazard type filter chips', () => {
        render(<AdminHighRiskZonesPage />);

        const filterToolbar = screen.getByRole('toolbar', { name: 'Filter zones by hazard type' });
        expect(within(filterToolbar).getByRole('button', { name: 'All' })).toBeInTheDocument();
        expect(within(filterToolbar).getByRole('button', { name: 'Landslide' })).toBeInTheDocument();
        expect(within(filterToolbar).getByRole('button', { name: 'Accident' })).toBeInTheDocument();
        expect(within(filterToolbar).getByRole('button', { name: 'Other' })).toBeInTheDocument();
        expect(within(filterToolbar).queryByRole('button', { name: /Flood/i })).not.toBeInTheDocument();
    });

    test('keeps the zone type in one closed row, with the options inside a menu', async () => {
        render(<AdminHighRiskZonesPage />);

        fireEvent.click(screen.getByRole('button', { name: /Add zone/i }));

        // The closed field states the current type on one line, whatever the panel
        // width. Three options in a fixed row could not: on this rail the labels
        // had to be shrunk to be readable at all, and the menu is what buys them a
        // normal size back.
        const trigger = screen.getByRole('button', { name: /Accident Prone/i });
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(trigger.querySelector('svg')).toBeTruthy();
        expect(within(trigger).getByText('Accident Prone').className).toContain('truncate');

        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute('aria-expanded', 'true');

        const listbox = await screen.findByRole('listbox', { name: 'Zone type' });
        const options = within(listbox).getAllByRole('option');
        expect(options.map((option) => option.textContent)).toEqual([
            expect.stringContaining('Landslide Prone'),
            expect.stringContaining('Accident Prone'),
            expect.stringContaining('Other Hazard'),
        ]);

        // No color coding: zone type is plain label text only.
        const dotColours = options.map((option) => option.querySelector('span')?.className || '');
        expect(dotColours.join(' ')).not.toContain('bg-amber-500');
        expect(dotColours.join(' ')).not.toContain('bg-red-500');
        expect(dotColours.join(' ')).not.toContain('bg-gray-500');

        // And the one that is on says so, rather than relying on the reader
        // noticing which row the tick is beside.
        expect(options[1]).toHaveAttribute('aria-selected', 'true');
        expect(options[0]).toHaveAttribute('aria-selected', 'false');
    });

    test('selects a zone type by mouse and by keyboard, and closes behind itself', async () => {
        render(<AdminHighRiskZonesPage />);

        fireEvent.click(screen.getByRole('button', { name: /Add zone/i }));
        const trigger = screen.getByRole('button', { name: /Accident Prone/i });
        const select = screen.getByLabelText('Zone type');

        // Mouse: the whole field is the target, and choosing closes the menu. The
        // option is looked up inside the listbox, because the hidden native select
        // legitimately carries `role="option"` too — it is the same list, read by
        // screen readers and by the form.
        fireEvent.click(trigger);
        const openListbox = await screen.findByRole('listbox', { name: 'Zone type' });
        fireEvent.click(within(openListbox).getByRole('option', { name: /Other Hazard/i }));
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(select).toHaveValue('other');
        expect(screen.getByRole('button', { name: /Other Hazard/i })).toBeInTheDocument();

        // Keyboard: open, move, commit. The browser's own focus is never moved to
        // the option — the trigger keeps it, which is what makes Tab out sensible.
        fireEvent.keyDown(screen.getByRole('button', { name: /Other Hazard/i }), { key: 'ArrowDown' });
        expect(await screen.findByRole('listbox')).toBeInTheDocument();
        fireEvent.keyDown(screen.getByRole('button', { name: /Other Hazard/i }), { key: 'Enter' });
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(select).toHaveValue('other');

        // The three ways out: choose, click away, Escape — each one closes it.
        fireEvent.click(trigger);
        expect(await screen.findByRole('listbox')).toBeInTheDocument();
        fireEvent.mouseDown(document.body);
        await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());

        fireEvent.click(trigger);
        expect(await screen.findByRole('listbox')).toBeInTheDocument();
        fireEvent.keyDown(trigger, { key: 'Escape' });
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Zone type')).toHaveValue('other');
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

    test('replaces the radius spinner with a slider over the band the form offers', () => {
        render(<AdminHighRiskZonesPage />);

        fireEvent.click(screen.getByRole('button', { name: /Add zone/i }));

        // A native range, deliberately: the arrows, PageUp/PageDown and Home/End
        // are the browser's, and no bespoke widget would give them as reliably as
        // the one element that is defined by having them.
        const slider = screen.getByLabelText(/^Radius$/i);
        expect(slider).toHaveAttribute('type', 'range');
        expect(slider).toHaveAttribute('min', '50');
        // The ceiling is the model's own, so every radius the database accepts can
        // be expressed here — including the few-kilometre corridors a zone can
        // legitimately cover.
        expect(slider).toHaveAttribute('max', '5000');
        expect(slider).toHaveAttribute('step', '10');
        expect(slider).toHaveValue('100');

        // A handle position is not a number anyone can act on, so the value is
        // stated beside the label, and the band it can travel is on the same
        // caption line rather than on a line of its own under the bar.
        expect(screen.getByText('100 m')).toBeInTheDocument();
        expect(screen.getByText('50–5000 m')).toBeInTheDocument();

        // The unit the spinner printed inside the field is spoken instead, and so
        // is the band the handle can travel.
        expect(slider).toHaveAttribute('aria-valuetext', '100 meters');
        expect(slider).toHaveAttribute('aria-describedby', 'risk-zone-radius-limits');
    });

    test('moves the value and the draft coverage circle together while dragging', async () => {
        render(<AdminHighRiskZonesPage />);

        fireEvent.click(screen.getByRole('button', { name: /Add zone/i }));
        fireEvent.click(screen.getByText('Select mock map point'));

        const slider = screen.getByLabelText(/^Radius$/i);
        const draftRadius = () => mockMapViewProps.mock.lastCall[0]
            .highRiskZones.find((zone) => zone._id === 'draft-risk-zone-preview')?.radius;

        await waitFor(() => expect(draftRadius()).toBe(100));

        fireEvent.change(slider, { target: { value: '300' } });

        // One state, two readers: the readout and the circle are drawn from the
        // same `formData.radius`, so there is no second copy to lag behind the drag.
        expect(radiusReadout()).toBe('300 m');
        expect(slider).toHaveAttribute('aria-valuetext', '300 meters');
        expect(draftRadius()).toBe(300);

        // 50 m is also the band's lower end printed under the track, so the readout
        // is named rather than searched for: at this value the two strings match.
        fireEvent.change(slider, { target: { value: '50' } });
        expect(radiusReadout()).toBe('50 m');
        expect(draftRadius()).toBe(50);
    });

    test('keeps a stored radius the form no longer offers, and saves it as it is', async () => {
        // 25 m: legal in the database (the schema floor is 10 m), below the 50 m
        // floor the form offers.
        mockUseGlobalHighRiskZones.mockReturnValue({
            zones: [{
                _id: 'zone-pinpoint',
                name: 'Pinpoint Hazard',
                type: 'other',
                severity: 'medium',
                radius: 25,
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
        fireEvent.click(screen.getByRole('button', { name: 'Edit Pinpoint Hazard' }));

        const slider = screen.getByLabelText(/^Radius$/i);

        // The handle sits at the bottom of the band, because it has nowhere further
        // to go — but the form says what the zone actually is, and says why it
        // cannot show it. Offering a narrower band is not the same as rewriting
        // the zone that opens in it.
        expect(slider).toHaveValue('50');
        expect(radiusReadout()).toBe('25 m');
        expect(screen.getByText(/outside the 50–5000 m/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Update zone/i }));

        await waitFor(() => {
            expect(mockHighRiskZonesAPI.update).toHaveBeenCalledWith('zone-pinpoint', expect.any(FormData));
        });
        expect(mockHighRiskZonesAPI.update.mock.calls.at(-1)[1].get('radius')).toBe('25');
    });

    test('hands an out-of-range radius over to the band as soon as the handle moves', () => {
        mockUseGlobalHighRiskZones.mockReturnValue({
            zones: [{
                _id: 'zone-pinpoint',
                name: 'Pinpoint Hazard',
                type: 'other',
                severity: 'medium',
                radius: 25,
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
        fireEvent.click(screen.getByRole('button', { name: 'Edit Pinpoint Hazard' }));

        const slider = screen.getByLabelText(/^Radius$/i);
        expect(radiusReadout()).toBe('25 m');

        fireEvent.change(slider, { target: { value: '200' } });

        // From the first movement on, there is nothing out of range to warn about:
        // the form owns the value, and the warning goes away with the state it was
        // describing rather than lingering as a stale banner.
        expect(radiusReadout()).toBe('200 m');
        expect(screen.queryByText(/outside the 50–5000 m/)).not.toBeInTheDocument();
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
        expect(within(screen.getByLabelText('Zone type')).queryByRole('option', { name: /Flood/i }))
            .not.toBeInTheDocument();

        // And the field does not quietly move to a type the zone is not: a
        // withdrawn value that names no option reads as nothing selected, so the
        // field and the notice agree that a choice is still owed.
        expect(screen.getByRole('button', { name: /Select a zone type/i })).toBeInTheDocument();
        expect(screen.getByLabelText('Zone type')).toHaveValue('');

        fireEvent.click(screen.getByRole('button', { name: /Update zone/i }));

        expect(mockHighRiskZonesAPI.update).not.toHaveBeenCalled();
        expect(mockToast.error).toHaveBeenCalledWith(expect.stringContaining('Flood Prone and Low'));

        // Replacing both is what unblocks it.
        fireEvent.click(screen.getByRole('button', { name: /Select a zone type/i }));
        const recoveryListbox = await screen.findByRole('listbox', { name: 'Zone type' });
        fireEvent.click(within(recoveryListbox).getByRole('option', { name: /Accident Prone/i }));
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

    test('keeps every layer switch behind one collapsed control in the map header', async () => {
        render(<AdminHighRiskZonesPage />);

        const mapWorkspace = screen.getByLabelText('High-risk zones map workspace');
        const control = within(mapWorkspace).getByRole('button', { name: /Layers/i });
        expect(control).toHaveAttribute('aria-expanded', 'false');

        // Closed, the control costs one line of header instead of the four rows
        // of chips it replaced — which is the whole reason the canvas can be the
        // page now. Nothing is switched on by default either way.
        expect(within(mapWorkspace).queryByRole('switch')).not.toBeInTheDocument();

        fireEvent.click(control);
        expect(control).toHaveAttribute('aria-expanded', 'true');
        expect(await within(mapWorkspace).findByRole('group', { name: 'Map layers' })).toBeInTheDocument();

        // Clicking anywhere outside shuts it, so it never sits over the map once
        // the operator has moved on to something else.
        fireEvent.pointerDown(document.body);
        await waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'false'));

        // Escape closes it too, and hands focus back to the button that opened it.
        fireEvent.click(control);
        await within(mapWorkspace).findByRole('group', { name: 'Map layers' });
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'false'));
        expect(control).toHaveFocus();
    });

    test('sends the whole map card into expanded mode, so the layer menu goes with it', async () => {
        render(<AdminHighRiskZonesPage />);

        const mapSection = screen.getByLabelText('High-risk zones map workspace');
        let props = mockMapViewProps.mock.lastCall[0];

        expect(props.isExpanded).toBe(false);
        expect(typeof props.onToggleExpand).toBe('function');
        expect(props.showFullscreenControl).toBeUndefined();

        // Expand button in canonical MapView mock is present
        const expandBtn = within(mapSection).getByRole('button', { name: 'Expand map' });
        expect(expandBtn).toBeInTheDocument();

        // Click expand button to enter expanded mode
        fireEvent.click(expandBtn);

        props = mockMapViewProps.mock.lastCall[0];
        expect(props.isExpanded).toBe(true);
        expect(mapSection).toHaveClass('fixed', 'inset-0', 'z-[60]');

        // Layer menu remains accessible inside the expanded map card
        expect(mapSection.contains(within(mapSection).getByRole('button', { name: /Layers/i }))).toBe(true);

        // Header and MapView tool rail both offer exit buttons
        const exitBtns = within(mapSection).getAllByRole('button', { name: 'Exit expanded map' });
        expect(exitBtns.length).toBe(2);

        // Click header exit button
        fireEvent.click(exitBtns[0]);

        props = mockMapViewProps.mock.lastCall[0];
        expect(props.isExpanded).toBe(false);
        expect(mapSection).not.toHaveClass('fixed', 'inset-0');
    });

    test('exits expanded mode when Escape key is pressed', async () => {
        render(<AdminHighRiskZonesPage />);

        const mapSection = screen.getByLabelText('High-risk zones map workspace');
        const expandBtn = within(mapSection).getByRole('button', { name: 'Expand map' });
        fireEvent.click(expandBtn);

        expect(mockMapViewProps.mock.lastCall[0].isExpanded).toBe(true);
        expect(mapSection).toHaveClass('fixed', 'inset-0', 'z-[60]');

        // Press Escape
        fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

        expect(mockMapViewProps.mock.lastCall[0].isExpanded).toBe(false);
        expect(mapSection).not.toHaveClass('fixed', 'inset-0');
    });

    test('omits expand button on phone viewports below sm', async () => {
        const originalMatchMedia = window.matchMedia;
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: query === '(max-width: 639px)',
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        try {
            render(<AdminHighRiskZonesPage />);

            expect(screen.queryByRole('button', { name: /expand map/i })).not.toBeInTheDocument();
            const props = mockMapViewProps.mock.lastCall[0];
            expect(props.isExpanded).toBe(false);

            // Programmatic toggle guarded on phone
            act(() => {
                props.onToggleExpand();
            });
            expect(mockMapViewProps.mock.lastCall[0].isExpanded).toBe(false);
        } finally {
            window.matchMedia = originalMatchMedia;
        }
    });

    test('auto-exits expanded mode when viewport resizes to mobile', async () => {
        const originalMatchMedia = window.matchMedia;
        let isPhone = false;
        let changeListener = null;

        window.matchMedia = vi.fn().mockImplementation((query) => ({
            get matches() {
                return isPhone && query === '(max-width: 639px)';
            },
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn((event, listener) => {
                if (event === 'change') changeListener = listener;
            }),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        try {
            render(<AdminHighRiskZonesPage />);

            const mapSection = screen.getByLabelText('High-risk zones map workspace');
            const expandBtn = within(mapSection).getByRole('button', { name: 'Expand map' });
            fireEvent.click(expandBtn);

            expect(mockMapViewProps.mock.lastCall[0].isExpanded).toBe(true);

            act(() => {
                isPhone = true;
                if (changeListener) {
                    changeListener({ matches: true });
                }
                window.dispatchEvent(new Event('resize'));
            });

            expect(mockMapViewProps.mock.lastCall[0].isExpanded).toBe(false);
        } finally {
            window.matchMedia = originalMatchMedia;
        }
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
        const panel = await openLayerControl(mapWorkspace);
        expect(within(panel).getByRole('switch', { name: 'Medium Landslide Susceptibility' }))
            .toHaveAttribute('aria-checked', 'false');
        expect(within(panel).getByRole('switch', { name: 'High Landslide Susceptibility' }))
            .toHaveAttribute('aria-checked', 'false');
        // Storm surge is no longer registered, so no switch may offer it.
        expect(within(panel).queryByRole('switch', { name: /surge|SSA/i })).not.toBeInTheDocument();
        // The attribution belongs to the layer, not to the popover that switches
        // it on, so it stays readable with the control shut.
        expect(within(mapWorkspace).getByText(/ODC-ODbL/)).toBeInTheDocument();
    });

    test('switches each susceptibility class independently, without reloading the map', async () => {
        render(<AdminHighRiskZonesPage />);

        const mapWorkspace = screen.getByLabelText('High-risk zones map workspace');
        const panel = await openLayerControl(mapWorkspace);
        const medium = within(panel).getByRole('switch', { name: 'Medium Landslide Susceptibility' });
        const high = within(panel).getByRole('switch', { name: 'High Landslide Susceptibility' });
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

    test('offers the accident-prone classes switched off, and says where they come from', async () => {
        render(<AdminHighRiskZonesPage />);

        const mapWorkspace = screen.getByLabelText('High-risk zones map workspace');
        const group = await openLayerControl(mapWorkspace);

        const medium = within(group).getByRole('switch', { name: 'Medium Accident-Prone Area' });
        expect(medium).toHaveAttribute('aria-checked', 'false');

        // The layer has one Medium hotspot and no High one, so High is offered,
        // disabled, with the rule that would light it up printed on it — a control
        // that silently disappears as the data moves is a control nobody can
        // learn, and "no data" is not something an operator can act on.
        const high = within(group).getByRole('switch', { name: 'High Accident-Prone Area' });
        expect(high).toBeDisabled();
        expect(high).toHaveAttribute('aria-checked', 'false');
        expect(high).toHaveAttribute(
            'title',
            'No area with 6+ validated reports within 100 m in the last 30 days.'
        );
        expect(medium).not.toBeDisabled();

        // The claim travels with the control: this is the system's own reading of
        // its own reports, not a government susceptibility rating.
        expect(medium).toHaveAttribute(
            'title',
            expect.stringMatching(/not an official government hazard classification/i)
        );

        await waitFor(() => {
            const props = mockMapViewProps.mock.lastCall[0];
            // Handed to the map switched off, like the susceptibility layers — and
            // with the rule attached, because the map draws the radius the server
            // clustered by.
            expect(props.accidentHotspotClasses).toEqual([]);
            expect(props.accidentHotspots.features).toHaveLength(1);
            expect(props.accidentHotspots.rule).toEqual(ACCIDENT_RULE);
        });
    });

    test('switches accident-prone classes independently of the susceptibility ones', async () => {
        seedAccidentHotspots([
            hotspotCell(2, 3, [122.676219, 12.345053]),
            hotspotCell(3, 6, [122.55, 12.4]),
        ]);

        render(<AdminHighRiskZonesPage />);

        const mapWorkspace = screen.getByLabelText('High-risk zones map workspace');
        const group = await openLayerControl(mapWorkspace);
        const mediumAccident = within(group).getByRole('switch', { name: 'Medium Accident-Prone Area' });
        const highAccident = within(group).getByRole('switch', { name: 'High Accident-Prone Area' });
        const landslideMedium = within(group).getByRole('switch', { name: 'Medium Landslide Susceptibility' });

        const props = () => mockMapViewProps.mock.lastCall[0];

        fireEvent.click(mediumAccident);
        await waitFor(() => expect(props().accidentHotspotClasses).toEqual([2]));

        // Both at once.
        fireEvent.click(highAccident);
        await waitFor(() => expect(props().accidentHotspotClasses).toEqual([2, 3]));
        expect(mediumAccident).toHaveAttribute('aria-checked', 'true');
        expect(highAccident).toHaveAttribute('aria-checked', 'true');

        // The susceptibility control is a different vocabulary — a different
        // dataset, a different claim, a different window — so switching one must
        // not move the other.
        fireEvent.click(landslideMedium);
        await waitFor(() => expect(props().hazardClassVisibility).toEqual({ landslide: [2] }));
        expect(props().accidentHotspotClasses).toEqual([2, 3]);

        // And back to the clean map the page opens with.
        fireEvent.click(mediumAccident);
        fireEvent.click(highAccident);
        await waitFor(() => expect(props().accidentHotspotClasses).toEqual([]));
        expect(props().hazardClassVisibility).toEqual({ landslide: [2] });
    });

    test('offers the classes disabled when no area reaches the floor', async () => {
        // Two validated accidents are two accidents: the server classifies
        // nothing, and the control says why rather than claiming a layer.
        seedAccidentHotspots([]);

        render(<AdminHighRiskZonesPage />);

        const mapWorkspace = screen.getByLabelText('High-risk zones map workspace');
        const group = await openLayerControl(mapWorkspace);

        const medium = within(group).getByRole('switch', { name: 'Medium Accident-Prone Area' });
        const high = within(group).getByRole('switch', { name: 'High Accident-Prone Area' });
        expect(medium).toBeDisabled();
        expect(high).toBeDisabled();
        expect(high).toHaveAttribute('title', expect.stringContaining('6+ validated reports within 100 m'));

        // The layer still reaches the map — empty — because the control's job is
        // to state what can be drawn, and right now that is nothing.
        expect(mockMapViewProps.mock.lastCall[0].accidentHotspots.features).toEqual([]);
    });

    test('describes a retuned rule as it is, not as it used to be', async () => {
        seedAccidentHotspots([], { ...ACCIDENT_RULE, radiusMeters: 250, highMinReports: 4 });

        render(<AdminHighRiskZonesPage />);

        const mapWorkspace = screen.getByLabelText('High-risk zones map workspace');
        const group = await openLayerControl(mapWorkspace);

        // A configuration change needs no code change here: the payload's rule is
        // what both the map and this sentence read.
        expect(within(group).getByRole('switch', { name: 'High Accident-Prone Area' }))
            .toHaveAttribute('title', 'No area with 4+ validated reports within 250 m in the last 30 days.');
        expect(mockMapViewProps.mock.lastCall[0].accidentHotspots.rule.radiusMeters).toBe(250);
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
        expect(screen.getByLabelText('Zone type')).toHaveValue('landslide_prone');
        expect(screen.getByRole('button', { name: /Landslide Prone/i })).toBeInTheDocument();
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
