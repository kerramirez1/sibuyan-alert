const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const truncate = (value, maximumLength) => cleanText(value).slice(0, maximumLength);

/**
 * Converts the shared report-location API response into safe risk-zone defaults.
 * Provider labels are descriptive only; administrative names must come from the
 * imported barangay polygon that contains the selected coordinate.
 */
export const buildRiskZoneLocationAutofill = (locationData) => {
    const lat = Number(locationData?.coordinates?.lat);
    const lng = Number(locationData?.coordinates?.lng);
    const barangay = cleanText(locationData?.barangay?.name);
    const municipality = cleanText(locationData?.municipality?.name);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || locationData?.isWithinSibuyanBounds !== true) {
        return {
            valid: false,
            message: 'Choose a valid point inside Sibuyan Island.',
        };
    }

    if (
        locationData?.barangayAssignment !== 'matched'
        || locationData?.municipalityAssignment !== 'matched'
        || !barangay
        || !municipality
    ) {
        return {
            valid: false,
            message: 'This point could not be verified against the barangay boundaries. Adjust the pin and try again.',
        };
    }

    const canonicalAddress = cleanText(
        locationData?.displayAddress
        || locationData?.address
        || `${barangay}, ${municipality}, Romblon`
    );

    return {
        valid: true,
        value: {
            coordinates: { lat, lng },
            barangay,
            municipality,
            name: truncate(`${barangay} Risk Zone`, 100),
            description: truncate(canonicalAddress, 500),
        },
    };
};

/** Replaces every coordinate-derived field when the selected pin changes. */
export const applyRiskZoneLocationAutofill = (currentForm, detectedLocation) => ({
    ...currentForm,
    name: detectedLocation.name,
    description: detectedLocation.description,
    municipality: detectedLocation.municipality,
});

export default { buildRiskZoneLocationAutofill, applyRiskZoneLocationAutofill };
