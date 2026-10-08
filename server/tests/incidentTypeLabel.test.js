import { describe, expect, test } from 'vitest';
import { INCIDENT_CATEGORIES, INCIDENT_CATEGORY_NAMES } from '../config/incidentCategories.js';
import { INCIDENT_TYPE_LABELS, getIncidentTypeLabel } from '../utils/incidentTypeLabel.js';

describe('server incident type labels', () => {
    test('every configured type has a label, and no label is orphaned', () => {
        const configuredTypes = INCIDENT_CATEGORY_NAMES.flatMap(
            (category) => INCIDENT_CATEGORIES[category].types
        );

        expect(Object.keys(INCIDENT_TYPE_LABELS).sort()).toEqual([...configuredTypes].sort());
    });

    test('getIncidentTypeLabel resolves canonical labels and falls back safely', () => {
        expect(getIncidentTypeLabel('structural')).toBe('Structural fire');
        expect(getIncidentTypeLabel('theft')).toBe('Theft');
        expect(getIncidentTypeLabel('vehicular')).toBe('Vehicular collision');
        expect(getIncidentTypeLabel('invented', 'Incident')).toBe('Incident');
        expect(getIncidentTypeLabel(null, 'Incident')).toBe('Incident');
    });
});
