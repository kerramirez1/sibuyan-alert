import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from '../router';

const mocks = vi.hoisted(() => ({
    search: vi.fn(),
    navigate: vi.fn(),
}));

vi.mock('../services/api', () => ({
    reportsAPI: {
        search: mocks.search,
    },
}));

vi.mock('../router', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useNavigate: () => mocks.navigate,
    };
});

const { default: ReportSearch } = await import('../components/search/ReportSearch');

describe('ReportSearch (MVP)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.search.mockResolvedValue({ data: { data: { results: [] } } });
    });

    test('does not query until at least 2 characters are typed', async () => {
        render(
            <MemoryRouter>
                <ReportSearch />
            </MemoryRouter>,
        );
        const box = screen.getByRole('combobox', { name: 'Search incident reports' });
        fireEvent.change(box, { target: { value: 'a' } });
        await waitFor(() => {
            expect(mocks.search).not.toHaveBeenCalled();
        });
    });

    test('debounces and renders redacted results without private fields', async () => {
        mocks.search.mockResolvedValue({
            data: {
                data: {
                    results: [
                        {
                            _id: 'report-1',
                            title: 'Road accident at Near Cambijang',
                            incidentType: 'motorcycle',
                            status: 'pending',
                            barangay: 'Cambijang',
                            municipalityName: 'Cajidiocan',
                            incidentTime: '2026-08-16T08:00:00.000Z',
                            isOwnedByCurrentUser: true,
                        },
                    ],
                },
            },
        });
        render(
            <MemoryRouter>
                <ReportSearch />
            </MemoryRouter>,
        );
        fireEvent.change(screen.getByRole('combobox', { name: 'Search incident reports' }), {
            target: { value: 'accident' },
        });

        await waitFor(() => {
            expect(mocks.search).toHaveBeenCalledWith('accident', expect.objectContaining({ limit: 8 }));
        });
        // Matched text is bolded, so assert the highlight plus surrounding row
        expect(await screen.findByText('accident', { selector: 'strong' })).toBeInTheDocument();
        const listbox = screen.getByRole('listbox');
        expect(listbox.textContent).toContain('Pending review');
        expect(listbox.textContent).toContain('Yours');
    });

    test('accident result always navigates to the map focus (RBAC detail enforced there)', async () => {
        mocks.search.mockResolvedValue({
            data: {
                data: {
                    results: [
                        {
                            _id: 'report-1',
                            title: 'Owned pending report',
                            status: 'pending',
                            barangay: 'Poblacion',
                            municipalityName: 'Cajidiocan',
                            isOwnedByCurrentUser: true,
                        },
                    ],
                },
            },
        });
        render(
            <MemoryRouter>
                <ReportSearch />
            </MemoryRouter>,
        );
        fireEvent.change(screen.getByRole('combobox', { name: 'Search incident reports' }), {
            target: { value: 'owned' },
        });
        const option = await screen.findByRole('option');
        fireEvent.click(option.querySelector('button'));
        expect(mocks.navigate).toHaveBeenCalledWith('/dashboard?view=map&report=report-1');
    });

    test('orders owned rows first in the minimalist list with a see-all footer', async () => {
        mocks.search.mockResolvedValue({
            data: {
                data: {
                    results: [
                        {
                            _id: 'report-1',
                            title: 'Owned accident report',
                            status: 'pending',
                            barangay: 'Poblacion',
                            municipalityName: 'Cajidiocan',
                            isOwnedByCurrentUser: true,
                        },
                        {
                            _id: 'report-2',
                            title: 'Public accident report',
                            status: 'resolved',
                            barangay: 'Danao',
                            municipalityName: 'Magdiwang',
                            isOwnedByCurrentUser: false,
                        },
                    ],
                    zones: [
                        {
                            kind: 'zone',
                            _id: 'zone-9',
                            title: 'Coastal accident bend',
                            severity: 'critical',
                            barangay: 'Danao',
                            municipalityName: 'Magdiwang',
                        },
                    ],
                },
            },
        });
        render(
            <MemoryRouter>
                <ReportSearch />
            </MemoryRouter>,
        );
        fireEvent.change(screen.getByRole('combobox', { name: 'Search incident reports' }), {
            target: { value: 'accident' },
        });

        expect(await screen.findByRole('listbox')).toBeInTheDocument();
        // Minimalist: section headers only when reports and zones mix
        expect(screen.getByText('Reports')).toBeInTheDocument();
        expect(screen.getByText('High-risk zones')).toBeInTheDocument();
        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(3);
        expect(options[0].textContent).toContain('Owned accident report');
        expect(options[1].textContent).toContain('Public accident report');
        expect(options[2].textContent).toContain('Coastal accident bend');
        // Plain-text status, no pill backgrounds
        expect(options[1].textContent).toContain('Resolved');

        fireEvent.click(screen.getByRole('button', { name: /See all results for/i }));
        expect(mocks.navigate).toHaveBeenCalledWith('/accident-history?q=accident');
    });

    test('high-risk zone rows navigate to the map zone focus', async () => {
        mocks.search.mockResolvedValue({
            data: {
                data: {
                    results: [],
                    zones: [
                        {
                            kind: 'zone',
                            _id: 'zone-1',
                            title: 'Cambijang Curve',
                            severity: 'high',
                            barangay: 'Cambijang',
                            municipalityName: 'Cajidiocan',
                        },
                    ],
                },
            },
        });
        render(
            <MemoryRouter>
                <ReportSearch />
            </MemoryRouter>,
        );
        fireEvent.change(screen.getByRole('combobox', { name: 'Search incident reports' }), {
            target: { value: 'cambijang' },
        });

        expect(await screen.findByRole('listbox')).toBeInTheDocument();
        // Zones-only: flat minimalist list, no section header needed
        const option = screen.getByRole('option');
        expect(option.textContent).toContain('Cambijang Curve');
        expect(option.textContent).toContain('High risk');
        fireEvent.click(option.querySelector('button'));
        expect(mocks.navigate).toHaveBeenCalledWith('/dashboard?view=map&riskZone=zone-1');
    });
});
