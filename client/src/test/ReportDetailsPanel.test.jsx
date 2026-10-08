import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import ReportDetailsPanel from '../components/report/ReportDetailsPanel';

const renderPanel = (formDataOverrides = {}) => {
    const setFormData = vi.fn();
    render(
        <ReportDetailsPanel
            step={2}
            formData={{
                incidentCategory: 'accident',
                incidentType: 'vehicular',
                incidentTime: '',
                description: '',
                severity: 'moderate',
                ...formDataOverrides,
            }}
            setFormData={setFormData}
            handleChange={vi.fn()}
            errors={{}}
            maxDateTime="2026-10-09T23:59"
            images={[]}
            imagePreviews={[]}
        />
    );
    return { setFormData };
};

describe('ReportDetailsPanel incident category', () => {
    test('renders a category select with three options', () => {
        renderPanel();

        const select = screen.getByRole('combobox', { name: 'Incident category' });
        expect([...select.options].map((option) => option.value)).toEqual(['accident', 'fire', 'crime']);
        expect([...select.options].map((option) => option.textContent)).toEqual(['Road accident', 'Fire', 'Crime']);
    });

    test('changing the category resets the type to the new category first type', () => {
        const { setFormData } = renderPanel();

        fireEvent.change(screen.getByRole('combobox', { name: 'Incident category' }), { target: { value: 'fire' } });

        expect(setFormData).toHaveBeenCalledTimes(1);
        // setFormData receives an updater; emulate it against prior state.
        const updater = setFormData.mock.calls[0][0];
        const next = updater({ incidentCategory: 'accident', incidentType: 'vehicular' });
        expect(next.incidentCategory).toBe('fire');
        expect(next.incidentType).toBe('structural');
    });

    test('changing to crime resets the type to theft', () => {
        const { setFormData } = renderPanel({ incidentCategory: 'fire', incidentType: 'vegetation' });

        fireEvent.change(screen.getByRole('combobox', { name: 'Incident category' }), { target: { value: 'crime' } });

        const updater = setFormData.mock.calls[0][0];
        const next = updater({ incidentCategory: 'fire', incidentType: 'vegetation' });
        expect(next).toMatchObject({ incidentCategory: 'crime', incidentType: 'theft' });
    });

    test('the type select shows the current category options', () => {
        renderPanel({ incidentCategory: 'fire', incidentType: 'structural' });

        const typeSelect = screen.getByRole('combobox', { name: 'Incident type' });
        expect([...typeSelect.options].map((option) => option.value))
            .toEqual(['structural', 'vegetation', 'vehicular_fire', 'other_fire']);
        expect(typeSelect.value).toBe('structural');
    });
});
