/**
 * Deduplicates repeated address, barangay, and municipality tokens in location strings.
 */
export function formatCleanAddress(input = {}) {
    const safeInput = input && typeof input === 'object' ? input : {};
    const { locationName, address, barangay, municipality, municipalityName } = safeInput;
    const loc = locationName || address;
    const muni = municipality || municipalityName;
    const parts = [loc, barangay, muni].filter(Boolean);
    const uniqueTokens = [];

    parts.forEach((part) => {
        const trimmed = String(part).trim();
        if (!trimmed) return;
        const isDuplicate = uniqueTokens.some(
            (existing) =>
                existing.toLowerCase() === trimmed.toLowerCase() ||
                existing.toLowerCase().includes(trimmed.toLowerCase()) ||
                trimmed.toLowerCase().includes(existing.toLowerCase())
        );
        if (!isDuplicate) {
            uniqueTokens.push(trimmed);
        }
    });

    return uniqueTokens.join(', ') || 'Sibuyan Island, Romblon';
}

export default { formatCleanAddress };
