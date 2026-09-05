const FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;

export const normalizeSpreadsheetValue = (value) => {
    if (value === null || value === undefined) {
        return '';
    }

    const text = String(value);
    return FORMULA_PREFIX_PATTERN.test(text) ? `'${text}` : text;
};

export const escapeCsvCell = (value) => {
    const normalized = normalizeSpreadsheetValue(value);
    return `"${normalized.replace(/"/g, '""')}"`;
};

export const buildCsvDocument = (sections) => sections
    .flatMap(({ title, columns = [], rows = [] }) => {
        const header = columns.map(({ label }) => escapeCsvCell(label)).join(',');
        const records = rows.map((row) => columns
            .map(({ key }) => escapeCsvCell(row[key]))
            .join(','));

        return [
            escapeCsvCell(title),
            header,
            ...records,
            '',
        ];
    })
    .join('\r\n');
