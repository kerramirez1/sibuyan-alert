import { normalizeSpreadsheetValue } from './csvExport';
import { formatCasualtyMetric } from './incidentDetails';
import { formatTrendBucketLabel } from './trendChartImage';

const TITLE_FONT = { bold: true, size: 14, color: { argb: 'FF111827' } };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E5F46' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
const DATE_NUMBER_FORMAT = 'yyyy-mm-dd hh:mm';

const toCellValue = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' || value instanceof Date) return value;
    return normalizeSpreadsheetValue(value);
};

const toDateCell = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date;
};

const columnLetter = (index) => {
    let letter = '';
    let remainder = index;
    while (remainder > 0) {
        const modulo = (remainder - 1) % 26;
        letter = String.fromCharCode(65 + modulo) + letter;
        remainder = Math.floor((remainder - 1) / 26);
    }
    return letter;
};

/**
 * Writes a full-width note row: the text goes into column A and is merged
 * across to lastColumn with wrapping, so long text is never visually
 * truncated. Returns the row.
 */
const writeFullWidthRow = (worksheet, lastColumn, text, { bold = false } = {}) => {
    const row = worksheet.addRow([toCellValue(text)]);
    worksheet.mergeCells(`A${row.number}:${lastColumn}${row.number}`);
    const cell = row.getCell(1);
    cell.alignment = { wrapText: true, vertical: 'top' };
    if (bold) {
        cell.font = { bold: true, size: 11, color: { argb: 'FF111827' } };
    }
    // Tall enough for two wrapped lines without manual resizing.
    row.height = 30;
    return row;
};

/**
 * Appends a full-width note row to the Summary sheet after the workbook was
 * built (e.g. the trend-chart note, which can only be added once
 * rasterization succeeds). The Summary sheet has two columns (A:B).
 */
export const appendSummaryNote = (summarySheet, text) => writeFullWidthRow(summarySheet, 'B', text);

const addTitledTable = (worksheet, { title, columns = [], rows = [], filterable = true }) => {
    const lastColumn = columnLetter(columns.length);

    const titleRow = worksheet.addRow([title]);
    titleRow.font = TITLE_FONT;
    titleRow.height = 22;
    worksheet.mergeCells(`A${titleRow.number}:${lastColumn}${titleRow.number}`);

    const headerRow = worksheet.addRow(columns.map((column) => column.label));
    headerRow.font = HEADER_FONT;
    headerRow.height = 20;
    headerRow.eachCell((cell) => {
        cell.fill = HEADER_FILL;
        cell.alignment = { vertical: 'middle' };
    });

    columns.forEach((column, index) => {
        worksheet.getColumn(index + 1).width = column.width;
    });

    rows.forEach((record) => {
        // Full-width rows (e.g. Summary notes): the text is written into
        // column A and merged across to the last column, so Excel/WPS can
        // wrap it instead of truncating at column A — a real empty-string
        // cell in column B would block text overflow into truly empty cells.
        if (record.fullWidth) {
            writeFullWidthRow(worksheet, lastColumn, record.metric, { bold: record.bold });
            return;
        }
        const row = worksheet.addRow(columns.map((column) => toCellValue(record[column.key])));
        columns.forEach((column, index) => {
            const cell = row.getCell(index + 1);
            // A column can opt its Date cells in wholesale (column.date), or a
            // single record can opt in (record.date).
            if ((column.date || record.date) && cell.value instanceof Date) {
                cell.numFmt = DATE_NUMBER_FORMAT;
            }
            if (column.wrap) {
                cell.alignment = { ...cell.alignment, wrapText: true, vertical: 'top' };
            }
        });
    });

    worksheet.views = [{ state: 'frozen', ySplit: headerRow.number }];
    // Key-value sheets (Summary) get no AutoFilter dropdowns — filtering a
    // two-column metric list is noise, not navigation.
    if (filterable) {
        worksheet.autoFilter = {
            from: `A${headerRow.number}`,
            to: `${lastColumn}${headerRow.number}`,
        };
    }
};

const formatCoordinates = (report) => {
    const lat = Number(report?.coordinates?.lat);
    const lng = Number(report?.coordinates?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng)
        ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
        : '';
};

const formatAgencies = (report) => {
    const agencies = Array.isArray(report?.respondingAgencies) && report.respondingAgencies.length > 0
        ? report.respondingAgencies
        : null;
    return agencies ? agencies.join(', ') : 'Awaiting assignment';
};

const toTrendCount = (value) => {
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
};

/**
 * Builds a formatted multi-sheet analytics workbook.
 *
 * ExcelJS is injected (dynamically imported at the call site) so the heavy
 * dependency never lands in the initial bundle; tests import it directly.
 */
export const buildAnalyticsWorkbook = (ExcelJS, {
    scopeLabel = 'Island-wide',
    monthLabel = '',
    exportedAt = new Date(),
    summary = [],
    incidents = [],
    zones = [],
    trend = [],
    truncatedNote = '',
} = {}) => {
    const safeIncidents = Array.isArray(incidents) ? incidents : [];
    const safeZones = Array.isArray(zones) ? zones : [];
    const safeSummary = Array.isArray(summary) ? summary : [];
    const safeTrend = Array.isArray(trend) ? trend : [];
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sibuyan Alert';
    workbook.created = exportedAt instanceof Date ? exportedAt : new Date();

    const summarySheet = workbook.addWorksheet('Summary');
    addTitledTable(summarySheet, {
        title: `Situation Overview · ${scopeLabel}${monthLabel ? ` · ${monthLabel}` : ''}`,
        filterable: false,
        columns: [
            // 48 fits the longest label ('Active High-Risk Zones (Current, as
            // of Export)', 44 chars) on one line.
            { key: 'metric', label: 'Metric', width: 48 },
            // No blanket date flag here: this sheet carries no Date values.
            { key: 'value', label: 'Value', width: 28 },
        ],
        rows: [
            { metric: 'Scope', value: scopeLabel },
            ...(monthLabel ? [{ metric: 'Month', value: monthLabel }] : []),
            ...safeSummary,
            // Blank row, then the Notes section: methodology the reader needs
            // to interpret the metrics. Notes span the full width (merged +
            // wrapped) so long text is never visually truncated.
            { metric: '', value: '' },
            { metric: 'Notes', value: '', fullWidth: true, bold: true },
            { metric: 'Resolution rate = Resolved ÷ (Verified + Transferred + Responding + Resolved). Pending-review reports are excluded.', value: '', fullWidth: true },
            { metric: 'Response time = minutes from report creation to first responder response, within the selected period.', value: '', fullWidth: true },
            { metric: 'Incident list matches the selected period; zone count is current as of export.', value: '', fullWidth: true },
            ...(truncatedNote ? [{ metric: truncatedNote, value: '', fullWidth: true }] : []),
        ],
    });

    const incidentSheet = workbook.addWorksheet('Incidents');
    addTitledTable(incidentSheet, {
        title: `Incident Reports · ${scopeLabel}${monthLabel ? ` · ${monthLabel}` : ''}`,
        columns: [
            { key: 'dateReported', label: 'Date Reported', width: 18, date: true },
            { key: 'incidentTime', label: 'Incident Time', width: 18, date: true },
            { key: 'title', label: 'Title', width: 40, wrap: true },
            { key: 'category', label: 'Category', width: 14 },
            { key: 'type', label: 'Type', width: 18 },
            { key: 'severity', label: 'Severity', width: 14 },
            { key: 'status', label: 'Status', width: 14 },
            { key: 'priority', label: 'Priority', width: 12 },
            { key: 'municipality', label: 'Municipality', width: 16 },
            { key: 'originMunicipality', label: 'Origin Municipality', width: 20 },
            { key: 'barangay', label: 'Barangay', width: 16 },
            { key: 'address', label: 'Exact Address', width: 38, wrap: true },
            { key: 'coordinates', label: 'Coordinates', width: 20 },
            { key: 'injured', label: 'Injured', width: 10 },
            { key: 'fatalities', label: 'Fatalities', width: 12 },
            { key: 'missing', label: 'Missing', width: 10 },
            { key: 'verifiedAt', label: 'Verified At', width: 18, date: true },
            { key: 'resolvedAt', label: 'Resolved At', width: 18, date: true },
            { key: 'resolutionNotes', label: 'Resolution Notes', width: 44, wrap: true },
            { key: 'respondingAgencies', label: 'Responding Agencies', width: 24, wrap: true },
            { key: 'description', label: 'Description', width: 50, wrap: true },
            { key: 'reporter', label: 'Reporter', width: 20 },
        ],
        rows: safeIncidents.map((report) => ({
            dateReported: toDateCell(report?.createdAt),
            incidentTime: toDateCell(report?.incidentTime),
            title: report?.title || 'Unknown',
            category: report?.incidentCategory || 'accident',
            type: report?.incidentType || 'Unknown',
            severity: report?.severity
                ? String(report.severity).charAt(0).toUpperCase() + String(report.severity).slice(1).toLowerCase()
                : 'Moderate',
            status: String(report?.status || 'unknown').toUpperCase(),
            priority: String(report?.priority || 'unknown').toUpperCase(),
            municipality: report?.municipalityName || 'Unknown',
            originMunicipality: report?.originalMunicipalityName || report?.municipalityName || 'Unknown',
            barangay: report?.barangay || 'Unknown',
            address: report?.address || 'Unknown',
            coordinates: formatCoordinates(report),
            // formatCasualtyMetric keeps "not recorded" distinct from 0 in the
            // export, matching the UI rather than silently coercing to a number.
            injured: formatCasualtyMetric(report?.casualties?.injured),
            fatalities: formatCasualtyMetric(report?.casualties?.fatalities),
            missing: formatCasualtyMetric(report?.casualties?.missing),
            verifiedAt: toDateCell(report?.verifiedAt),
            resolvedAt: toDateCell(report?.resolvedAt),
            resolutionNotes: report?.resolutionNotes || '',
            respondingAgencies: formatAgencies(report),
            description: report?.description || '',
            reporter: report?.reporter?.name || 'Unknown User',
        })),
    });

    const trendSheet = workbook.addWorksheet('Trend Data');
    addTitledTable(trendSheet, {
        title: `Incident Trend Data · ${scopeLabel}${monthLabel ? ` · ${monthLabel}` : ''}`,
        columns: [
            { key: 'period', label: 'Period', width: 18 },
            { key: 'minor', label: 'Minor', width: 12 },
            { key: 'moderate', label: 'Moderate', width: 12 },
            { key: 'severe', label: 'Severe', width: 12 },
            { key: 'critical', label: 'Critical', width: 12 },
            { key: 'unknown', label: 'Unknown', width: 12 },
            { key: 'total', label: 'Total', width: 12 },
        ],
        rows: safeTrend.map((bucket) => ({
            period: formatTrendBucketLabel(bucket),
            minor: toTrendCount(bucket?.minor),
            moderate: toTrendCount(bucket?.moderate),
            severe: toTrendCount(bucket?.severe),
            critical: toTrendCount(bucket?.critical),
            unknown: toTrendCount(bucket?.unknown),
            total: toTrendCount(bucket?.total),
        })),
    });

    const zoneSheet = workbook.addWorksheet('Risk Zones');
    addTitledTable(zoneSheet, {
        title: `High-Risk Zones · ${scopeLabel}`,
        columns: [
            { key: 'name', label: 'Zone Name', width: 32, wrap: true },
            { key: 'type', label: 'Type', width: 18 },
            { key: 'municipality', label: 'Municipality', width: 16 },
            { key: 'address', label: 'Address', width: 34, wrap: true },
            { key: 'status', label: 'Status', width: 12 },
            { key: 'incidentCount', label: 'Incident Count', width: 16 },
            { key: 'radius', label: 'Radius (m)', width: 12 },
        ],
        rows: safeZones.map((zone) => ({
            name: zone?.name || 'Unnamed Zone',
            type: String(zone?.type || 'unknown').replace(/_/g, ' ').toUpperCase(),
            municipality: zone?.municipality || zone?.municipalityName || 'Unknown',
            address: zone?.address || 'Unknown',
            status: zone?.isActive === false ? 'Inactive' : 'Active',
            incidentCount: Number(zone?.stats?.incidentCount) || 0,
            radius: Number(zone?.radius) || 0,
        })),
    });

    return workbook;
};

export const writeWorkbookToBuffer = (workbook) => workbook.xlsx.writeBuffer();
