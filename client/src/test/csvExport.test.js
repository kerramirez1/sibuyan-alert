import { describe, expect, it } from 'vitest';
import {
    buildCsvDocument,
    escapeCsvCell,
    normalizeSpreadsheetValue,
} from '../utils/csvExport';

describe('csvExport', () => {
    it.each(['=SUM(1,1)', '+cmd', '-1+2', '@IMPORT', '\tformula', '\rformula'])(
        'neutralizes spreadsheet formula prefix %s',
        (value) => {
            expect(normalizeSpreadsheetValue(value)).toBe(`'${value}`);
        }
    );

    it('preserves numbers and escapes quotes safely', () => {
        expect(normalizeSpreadsheetValue(12)).toBe('12');
        expect(escapeCsvCell('Sibuyan "Alert"')).toBe('"Sibuyan ""Alert"""');
    });

    it('builds labeled sections with stable columns even when a section has no rows', () => {
        const csv = buildCsvDocument([
            {
                title: 'Reports',
                columns: [
                    { key: 'name', label: 'Name' },
                    { key: 'status', label: 'Status' },
                ],
                rows: [{ name: 'Test report', status: 'Verified' }],
            },
            {
                title: 'Risk Zones',
                columns: [{ key: 'name', label: 'Name' }],
                rows: [],
            },
        ]);

        expect(csv).toContain('"Reports"\r\n"Name","Status"');
        expect(csv).toContain('"Test report","Verified"');
        expect(csv).toContain('"Risk Zones"\r\n"Name"');
    });
});
