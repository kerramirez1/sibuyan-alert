import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { SIBUYAN_BARANGAY_PSGC_CODES } from '../config/sibuyanLocations.js';

const BOUNDARY_SERVICE_URL = 'https://portal.georisk.gov.ph/arcgis/rest/services/PSA/Barangay/MapServer/4/query';
const defaultOutputPath = path.resolve(process.cwd(), 'data/psa-georisk-sibuyan-barangays.geojson');
const outputPath = path.resolve(process.env.SIBUYAN_BOUNDARIES_FILE || defaultOutputPath);

const psgcCodes = Object.values(SIBUYAN_BARANGAY_PSGC_CODES)
    .flatMap((barangays) => Object.values(barangays));

const downloadBoundaries = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
        const url = new URL(BOUNDARY_SERVICE_URL);
        url.searchParams.set('where', `psgc_10d IN (${psgcCodes.map((code) => `'${code}'`).join(',')})`);
        url.searchParams.set('outFields', 'psgc_10d,brgy_name,city_name,prov_name');
        url.searchParams.set('returnGeometry', 'true');
        url.searchParams.set('outSR', '4326');
        url.searchParams.set('f', 'geojson');

        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`PSA/GeoRisk boundary service returned HTTP ${response.status}.`);

        const featureCollection = await response.json();
        if (featureCollection?.type !== 'FeatureCollection' || featureCollection.features?.length !== psgcCodes.length) {
            throw new Error(`Expected ${psgcCodes.length} Sibuyan features, received ${featureCollection?.features?.length || 0}.`);
        }

        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, JSON.stringify(featureCollection), 'utf8');
        console.log(`Downloaded ${featureCollection.features.length} detailed PSA/GeoRisk Sibuyan boundaries to ${outputPath}.`);
    } catch (error) {
        const message = error.name === 'AbortError'
            ? 'PSA/GeoRisk boundary download timed out.'
            : error.message;
        console.error(`Failed to download Sibuyan boundaries: ${message}`);
        process.exitCode = 1;
    } finally {
        clearTimeout(timeout);
    }
};

downloadBoundaries();
