import { getSibuyanBarangayByPsgcCode, SIBUYAN_BARANGAY_PSGC_CODES } from '../config/sibuyanLocations.js';

export const SIBUYAN_BOUNDARY_DATASET = Object.freeze({
    source: 'Philippine Statistics Authority Barangay Boundary via GeoRiskPH ArcGIS REST service',
    sourceVersion: '2016-06 indicative boundaries',
    psgcSnapshot: '2026-06 canonical code and name mapping',
});

// Some small coastal barangays are legitimately simple, but the previously
// downloaded Alibagon triangle had only four ring positions and was not usable
// for road-level matching.
const MIN_BOUNDARY_POSITIONS = 10;

const expectedBoundaryCount = Object.values(SIBUYAN_BARANGAY_PSGC_CODES)
    .reduce((count, barangays) => count + Object.keys(barangays).length, 0);

const isPolygonGeometry = (geometry) => ['Polygon', 'MultiPolygon'].includes(geometry?.type)
    && Array.isArray(geometry.coordinates)
    && geometry.coordinates.length > 0;

const countPositions = (coordinates) => {
    if (!Array.isArray(coordinates)) return 0;
    if (coordinates.length >= 2 && coordinates.every(Number.isFinite)) return 1;
    return coordinates.reduce((count, item) => count + countPositions(item), 0);
};

export const buildSibuyanBoundaryDocuments = (featureCollection) => {
    if (featureCollection?.type !== 'FeatureCollection' || !Array.isArray(featureCollection.features)) {
        throw new Error('Boundary dataset must be a GeoJSON FeatureCollection.');
    }

    const documents = featureCollection.features.reduce((items, feature) => {
        const properties = feature?.properties || {};
        const canonical = getSibuyanBarangayByPsgcCode(properties.psgc_10d || properties.psgc_code);
        if (!canonical) return items;
        if (!isPolygonGeometry(feature.geometry)) {
            throw new Error(`Boundary geometry is missing or invalid for ${canonical.name}.`);
        }
        const municipalityName = properties.city_name || properties.ADM3_EN;
        if (municipalityName !== canonical.municipality) {
            throw new Error(`Municipality mismatch for ${canonical.name}: expected ${canonical.municipality}.`);
        }
        const positionCount = countPositions(feature.geometry.coordinates);
        if (positionCount < MIN_BOUNDARY_POSITIONS) {
            throw new Error(`Boundary geometry for ${canonical.name} is overly simplified (${positionCount} positions).`);
        }

        items.push({
            psgcCode: canonical.psgcCode,
            name: canonical.name,
            municipalityName: canonical.municipality,
            geometry: feature.geometry,
            dataset: SIBUYAN_BOUNDARY_DATASET,
            isActive: true,
        });
        return items;
    }, []);

    if (documents.length !== expectedBoundaryCount) {
        throw new Error(`Expected ${expectedBoundaryCount} Sibuyan barangay polygons, found ${documents.length}.`);
    }
    if (new Set(documents.map((document) => document.psgcCode)).size !== documents.length) {
        throw new Error('Boundary dataset contains duplicate Sibuyan PSGC codes.');
    }

    return documents;
};

export const getExpectedSibuyanBoundaryCount = () => expectedBoundaryCount;
