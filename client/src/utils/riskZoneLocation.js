import { describeHazards, summarizeHazards } from '../config/hazardAreas';

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const truncate = (value, maximumLength) => cleanText(value).slice(0, maximumLength);

/** The type the zone form opens with, and the only one a suggestion may replace. */
export const DEFAULT_ZONE_TYPE = 'accident_prone';

/**
 * Converts the shared report-location API response into safe risk-zone defaults.
 * Provider labels are descriptive only; administrative names must come from the
 * imported barangay polygon that contains the selected coordinate.
 *
 * Hazard readings come from the same response (the server resolves every
 * imported NOAH layer on the geocode call), so a pin gets jurisdiction and
 * hazards in one round-trip.
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

    // A reading of "unknown" is preserved as unknown. Collapsing it into "clear"
    // would let a missing dataset read as a safe location, which is the one
    // direction this must never fail in.
    const hazards = describeHazards(locationData?.hazards);

    return {
        valid: true,
        value: {
            coordinates: { lat, lng },
            barangay,
            municipality,
            name: truncate(`${barangay} Risk Zone`, 100),
            description: truncate(canonicalAddress, 500),
            hazards,
            hazardSummary: summarizeHazards(hazards),
            suggestedZoneType: hazards.suggestion?.zoneType || null,
        },
    };
};

/**
 * Replaces every coordinate-derived field when the selected pin changes.
 *
 * The zone type is only adopted when the form is still on its opening default.
 * The hazard reading is new information about a new location, so suggesting a
 * type is helpful — but silently overwriting a type the administrator chose on
 * purpose would be the form arguing with its user.
 */
export const applyRiskZoneLocationAutofill = (currentForm, detectedLocation) => {
    const next = {
        ...currentForm,
        name: detectedLocation.name,
        description: detectedLocation.description,
        municipality: detectedLocation.municipality,
    };

    if (detectedLocation.suggestedZoneType && currentForm?.type === DEFAULT_ZONE_TYPE) {
        next.type = detectedLocation.suggestedZoneType;
    }

    return next;
};

export default { buildRiskZoneLocationAutofill, applyRiskZoneLocationAutofill, DEFAULT_ZONE_TYPE };
