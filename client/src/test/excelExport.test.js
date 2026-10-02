import { describe, expect, test } from 'vitest';
import ExcelJS from 'exceljs';
import { buildAnalyticsWorkbook, writeWorkbookToBuffer } from '../utils/excelExport';

const incident = {
    _id: 'report-1',
    title: '=1+1 malicious title',
    incidentCategory: 'accident',
    incidentType: 'vehicular',
    severity: 'critical',
    status: 'transferred',
    priority: 'urgent',
    municipalityName: 'Magdiwang',
    originalMunicipalityName: 'Cajidiocan',
    barangay: 'Cambijang',
    address: 'Near Cambijang, Poblacion',
    coordinates: { lat: 12.39261, lng: 122.67985 },
    casualties: { injured: 2, fatalities: 0, missing: 1 },
    incidentTime: '2026-08-08T02:27:00.000Z',
    createdAt: '2026-08-08T02:30:00.000Z',
    verifiedAt: '2026-08-08T03:00:00.000Z',
    resolvedAt: null,
    resolutionNotes: 'Units stood down.',
    respondingAgencies: ['MDRRMO', 'BFP'],
    description: 'Two motorcycles collided.',
    reporter: { name: 'Juan Dela Cruz' },
    transferHistory: [{ fromMunicipalityName: 'Cajidiocan', toMunicipalityName: 'Magdiwang' }],
};

const build = (overrides = {}) => buildAnalyticsWorkbook(ExcelJS, {
    scopeLabel: 'Cajidiocan',
    monthLabel: 'August 2026',
    exportedAt: new Date('2026-09-01T00:00:00.000Z'),
    summary: [{ metric: 'Pending Review', value: 2 }],
    incidents: [incident],
    zones: [{ _id: 'z1', name: 'Landslide Hill', type: 'landslide_prone', municipality: 'Cajidiocan', address: 'Km 4', isActive: true, stats: { incidentCount: 3 }, radius: 150 }],
    ...overrides,
});

const headerLabels = (sheet) => sheet.getRow(2).values.slice(1);

describe('excelExport workbook', () => {
    test('creates three titled sheets with frozen headers; only data sheets are filterable', () => {
        const workbook = build();

        expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Summary', 'Incidents', 'Risk Zones']);

        for (const sheet of workbook.worksheets) {
            expect(sheet.getRow(1).getCell(1).value).toMatch(/Cajidiocan/);
            expect(sheet.views).toEqual([{ state: 'frozen', ySplit: 2 }]);
        }

        // The key-value Summary sheet gets no AutoFilter dropdowns; the data
        // sheets keep them.
        expect(workbook.getWorksheet('Summary').autoFilter).toBeFalsy();
        expect(workbook.getWorksheet('Incidents').autoFilter).toBeTruthy();
        expect(workbook.getWorksheet('Risk Zones').autoFilter).toBeTruthy();

        expect(headerLabels(workbook.getWorksheet('Incidents'))).toContain('Origin Municipality');
        expect(headerLabels(workbook.getWorksheet('Incidents'))).toContain('Severity');
        expect(headerLabels(workbook.getWorksheet('Incidents'))).toContain('Missing');
    });

    test('maps the full incident record with numbers, dates, and injection guard', () => {
        const workbook = build();
        const sheet = workbook.getWorksheet('Incidents');
        const labels = headerLabels(sheet);
        const row = sheet.getRow(3);

        const value = (label) => row.getCell(labels.indexOf(label) + 1).value;

        expect(value('Title')).toBe("'=1+1 malicious title");
        expect(value('Severity')).toBe('Critical');
        expect(value('Status')).toBe('TRANSFERRED');
        expect(value('Municipality')).toBe('Magdiwang');
        expect(value('Origin Municipality')).toBe('Cajidiocan');
        expect(value('Coordinates')).toBe('12.3926, 122.6799');
        expect(value('Injured')).toBe(2);
        expect(value('Missing')).toBe(1);
        expect(value('Responding Agencies')).toBe('MDRRMO, BFP');
        expect(value('Reporter')).toBe('Juan Dela Cruz');

        const reportedCell = row.getCell(labels.indexOf('Date Reported') + 1);
        expect(reportedCell.value instanceof Date).toBe(true);
        expect(reportedCell.numFmt).toBe('yyyy-mm-dd hh:mm');
    });

    test('keeps headers and scope rows with empty datasets', () => {
        const workbook = build({ incidents: [], zones: [], summary: [] });

        expect(workbook.getWorksheet('Incidents').rowCount).toBe(2);
        expect(workbook.getWorksheet('Risk Zones').rowCount).toBe(2);
        const summarySheet = workbook.getWorksheet('Summary');
        const summaryTexts = summarySheet.getColumn(1).values.join(' ');
        expect(summaryTexts).toContain('Scope');
        // The Exported At row was removed; the timestamp lives only in the
        // workbook metadata. No Summary value cell carries a date format.
        expect(summaryTexts).not.toContain('Exported At');
        const labels = headerLabels(summarySheet);
        summarySheet.eachRow((row, rowNumber) => {
            if (rowNumber > 2) {
                expect(row.getCell(labels.indexOf('Value') + 1).numFmt).not.toBe('yyyy-mm-dd hh:mm');
            }
        });
    });

    test('appends a Notes section explaining the metrics, plus the truncation note when given', () => {
        const truncated = 'Incident list truncated to the first 5000 rows; totals above reflect the full set.';
        const workbook = build({ truncatedNote: truncated });
        const sheet = workbook.getWorksheet('Summary');
        const summaryTexts = sheet.getColumn(1).values.join(' ');

        expect(summaryTexts).toContain('Notes');
        expect(summaryTexts).toContain('Resolution rate = Resolved ÷ (Verified + Transferred + Responding + Resolved). Pending-review reports are excluded.');
        expect(summaryTexts).toContain('Response time = minutes from report creation to first responder response, within the selected period.');
        expect(summaryTexts).toContain('Incident list matches the selected period; zone count is current as of export.');
        expect(summaryTexts).toContain(truncated);

        const withoutTruncation = build().getWorksheet('Summary').getColumn(1).values.join(' ');
        expect(withoutTruncation).not.toContain(truncated);
    });

    test('renders notes as full-width merged rows so long text wraps instead of truncating', () => {
        const workbook = build({ truncatedNote: 'Truncated note here.' });
        const sheet = workbook.getWorksheet('Summary');

        // Metric column widened to fit the longest label on one line.
        expect(sheet.getColumn(1).width).toBe(48);
        expect(sheet.getColumn(2).width).toBe(28);

        const noteRows = [];
        sheet.eachRow((row, rowNumber) => {
            const text = row.getCell(1).value;
            if (rowNumber > 2 && typeof text === 'string' && (text === 'Notes' || text.startsWith('Resolution rate') || text === 'Truncated note here.')) {
                noteRows.push({ row, rowNumber, text });
            }
        });
        expect(noteRows.length).toBe(3);

        // ExcelJS Cell.Types.Merge — not exported from the installed build,
        // so the numeric value is pinned here.
        const CELL_TYPE_MERGE = 1;
        for (const { row, rowNumber } of noteRows) {
            // Merged across both columns: B is a merge slave holding no
            // independent value, so no empty-string cell blocks Excel/WPS
            // text overflow.
            expect(sheet.model.merges).toContain(`A${rowNumber}:B${rowNumber}`);
            expect(row.getCell(2).type).toBe(CELL_TYPE_MERGE);
            expect(row.getCell(1).alignment).toMatchObject({ wrapText: true, vertical: 'top' });
            expect(row.height).toBe(30);
        }

        // The Notes header reads as a section header, not a data row.
        const headerRow = noteRows.find(({ text }) => text === 'Notes').row;
        expect(headerRow.getCell(1).font).toMatchObject({ bold: true, size: 11 });
    });

    test('serializes to bytes that reload as the same workbook', async () => {
        const buffer = await writeWorkbookToBuffer(build());

        expect(buffer.byteLength).toBeGreaterThan(0);

        const reloaded = new ExcelJS.Workbook();
        await reloaded.xlsx.load(buffer);

        expect(reloaded.worksheets.map((sheet) => sheet.name)).toEqual(['Summary', 'Incidents', 'Risk Zones']);
        const incidents = reloaded.getWorksheet('Incidents');
        expect(incidents.getRow(2).getCell(1).value).toBe('Date Reported');
        expect(incidents.getRow(3).getCell(3).value).toBe("'=1+1 malicious title");
    });
});
