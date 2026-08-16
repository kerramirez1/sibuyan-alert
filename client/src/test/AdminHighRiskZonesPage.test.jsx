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
    },
];

const mockRefresh = vi.fn();
const mockUseGlobalHighRiskZones = vi.fn();

vi.mock('../hooks/useGlobalHighRiskZones', () => ({
    default: () => mockUseGlobalHighRiskZones(),
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
    }),
}));

const mockMapViewProps = vi.fn();

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
    highRiskZonesAPI: {
        create: vi.fn().mockResolvedValue({ data: { success: true } }),
        update: vi.fn().mockResolvedValue({ data: { success: true } }),
        delete: vi.fn().mockResolvedValue({ data: { success: true } }),
    },
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
        searchLocations: vi.fn().mockResolvedValue({
            data: {
                data: [{ lat: 12.3785, lng: 122.5432, address: 'Cambajao, Cajidiocan' }],
            },
        }),
    },
}));

import AdminHighRiskZonesPage from '../pages/AdminHighRiskZonesPage';

describe('AdminHighRiskZonesPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseGlobalHighRiskZones.mockReturnValue({
            zones: mockZones,
            loading: false,
            refresh: mockRefresh,
        });
    });

    test('renders page header, status pill, map workspace, and marked zones list', () => {
        render(<AdminHighRiskZonesPage />);

        expect(screen.getByText('High-risk zones')).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1, name: 'High-risk zone management' })).toBeInTheDocument();
        expect(screen.getByText(/View mapped hazards and manage zones for Cajidiocan\./i)).toBeInTheDocument();
        expect(screen.getByText(/Sibuyan Island · Alert System Active/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Add zone/i })).toBeInTheDocument();

        expect(screen.getByRole('region', { name: 'High-risk zones map workspace' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'High-risk zones map' })).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Search place or landmark...')).toBeInTheDocument();

        expect(screen.getByRole('region', { name: 'Marked high-risk zones' })).toBeInTheDocument();
        expect(screen.getByText('Marked zones (2)')).toBeInTheDocument();
        expect(screen.getByText('Cambajao River Overflow')).toBeInTheDocument();
        expect(screen.getByText('Magdiwang Highway Curve')).toBeInTheDocument();

        // MapView configured specifically for hazard zones without incident status legend
        expect(mockMapViewProps).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: 'risk-zones',
                showLegend: false,
                highRiskZones: mockZones,
            })
        );

        // Check view-only vs editable zones
        expect(screen.getByRole('button', { name: 'Edit Cambajao River Overflow' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete Cambajao River Overflow' })).toBeInTheDocument();
        expect(screen.getByText('View only')).toBeInTheDocument();
    });

    test('opens zone creation form when clicking Add zone and allows cancelling', () => {
        render(<AdminHighRiskZonesPage />);

        fireEvent.click(screen.getByRole('button', { name: /Add zone/i }));

        expect(screen.getByRole('heading', { name: 'Add high-risk zone' })).toBeInTheDocument();
        expect(screen.getByLabelText(/Zone name/i)).toBeInTheDocument();
        expect(screen.getByRole('radiogroup', { name: 'Zone type' })).toBeInTheDocument();
        expect(screen.getByRole('radiogroup', { name: 'Severity level' })).toBeInTheDocument();
        expect(screen.getByLabelText(/Radius \(meters\)/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create zone' })).toBeDisabled();

        // Cancel returns to list
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.getByRole('region', { name: 'Marked high-risk zones' })).toBeInTheDocument();
    });

    test('populates editor when clicking edit on an assigned zone', () => {
        render(<AdminHighRiskZonesPage />);

        fireEvent.click(screen.getByRole('button', { name: 'Edit Cambajao River Overflow' }));

        expect(screen.getByRole('heading', { name: 'Edit high-risk zone' })).toBeInTheDocument();
        expect(screen.getByLabelText(/Zone name/i)).toHaveValue('Cambajao River Overflow');
        expect(screen.getByLabelText(/Radius \(meters\)/i)).toHaveValue(150);
        expect(screen.getByRole('button', { name: 'Update zone' })).toBeInTheDocument();

        // Close button exits editor
        fireEvent.click(screen.getByRole('button', { name: 'Close zone editor' }));
        expect(screen.getByRole('region', { name: 'Marked high-risk zones' })).toBeInTheDocument();
    });

    test('allows selecting a location from the map and submitting a new zone', async () => {
        render(<AdminHighRiskZonesPage />);

        fireEvent.click(screen.getByRole('button', { name: /Add zone/i }));

        const nameInput = screen.getByLabelText(/Zone name/i);
        fireEvent.change(nameInput, { target: { value: 'New Landslide Hazard' } });

        // Select point on map
        fireEvent.click(screen.getByText('Select mock map point'));

        await waitFor(() => {
            expect(screen.getByText(/Location selected: 12.3785, 122.5432/i)).toBeInTheDocument();
        });

        const submitBtn = screen.getByRole('button', { name: 'Create zone' });
        expect(submitBtn).toBeEnabled();
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(mockRefresh).toHaveBeenCalled();
        });
    });
});
