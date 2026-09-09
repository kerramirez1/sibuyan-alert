import { resolveBarangayForCoordinates } from './barangayBoundaryService.js';
import { isCoordinatePair } from '../utils/locationPolicy.js';

export const validateRiskZoneBoundaryResolution = (resolution, assignedMunicipality) => {
    if (resolution?.status === 'invalid_coordinates') {
        return { valid: false, statusCode: 400, message: 'Valid zone coordinates are required.' };
    }

    if (resolution?.status === 'dataset_missing') {
        return {
            valid: false,
            statusCode: 503,
            message: 'Barangay boundary dataset is not imported. Run npm run import:barangay-boundaries --prefix server, then retry.',
        };
    }

    if (resolution?.status !== 'matched' || !resolution?.barangay) {
        return {
            valid: false,
            statusCode: 422,
            message: 'The selected point could not be verified against a unique barangay boundary. Adjust the pin and try again.',
        };
    }

    const barangay = String(resolution.barangay.name || '').trim();
    const municipality = String(resolution.barangay.municipalityName || '').trim();
    if (!barangay || !municipality) {
        return {
            valid: false,
            statusCode: 422,
            message: 'The matched barangay boundary is missing jurisdiction data.',
        };
    }

    if (assignedMunicipality && municipality !== assignedMunicipality) {
        return {
            valid: false,
            statusCode: 403,
            message: `This location belongs to ${municipality}. You can only manage zones in ${assignedMunicipality}.`,
        };
    }

    return {
        valid: true,
        value: {
            barangay,
            municipality,
            psgcCode: resolution.barangay.psgcCode || null,
        },
    };
};

/** Resolves risk-zone jurisdiction from the same polygon dataset used by reports. */
export const resolveRiskZoneJurisdiction = async (coordinates, assignedMunicipality) => {
    const lat = Number(coordinates?.lat);
    const lng = Number(coordinates?.lng);
    if (!isCoordinatePair(lat, lng)) {
        return validateRiskZoneBoundaryResolution(
            { status: 'invalid_coordinates', barangay: null },
            assignedMunicipality
        );
    }

    const resolution = await resolveBarangayForCoordinates(lat, lng);
    const validation = validateRiskZoneBoundaryResolution(resolution, assignedMunicipality);
    if (!validation.valid) return validation;

    return {
        ...validation,
        value: {
            ...validation.value,
            coordinates: { lat, lng },
        },
    };
};

export default { resolveRiskZoneJurisdiction, validateRiskZoneBoundaryResolution };
