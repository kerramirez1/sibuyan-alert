import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import BarangayBoundary from '../models/BarangayBoundary.js';
import { buildSibuyanBoundaryDocuments } from '../utils/sibuyanBoundaryDataset.js';

const defaultDatasetPath = path.resolve(
    process.cwd(),
    'data/psa-georisk-sibuyan-barangays.geojson'
);
const datasetPath = path.resolve(process.env.SIBUYAN_BOUNDARIES_FILE || defaultDatasetPath);

const importBoundaries = async () => {
    try {
        const rawDataset = await fs.readFile(datasetPath, 'utf8');
        const documents = buildSibuyanBoundaryDocuments(JSON.parse(rawDataset));

        console.log(`Validated ${documents.length} Sibuyan barangay boundaries. Connecting to MongoDB...`);
        await connectDB();
        console.log('Writing boundary records...');
        await BarangayBoundary.bulkWrite(documents.map((document) => ({
            updateOne: {
                filter: { psgcCode: document.psgcCode },
                update: { $set: document },
                upsert: true,
            },
        })), { ordered: true });
        console.log('Ensuring geospatial indexes...');
        await BarangayBoundary.createIndexes();

        // Regression guard for the reported Gutivan/Sugod mismatch: this is an
        // interior Gutivan point and must resolve through the same geospatial
        // operator used by report location processing.
        const gutivan = await BarangayBoundary.findOne({
            psgcCode: '1705903007',
            geometry: {
                $geoIntersects: {
                    $geometry: { type: 'Point', coordinates: [122.67985, 12.39261] },
                },
            },
        }).select('name municipalityName psgcCode').lean();
        if (!gutivan || gutivan.name !== 'Gutivan' || gutivan.municipalityName !== 'Cajidiocan') {
            throw new Error('Gutivan point-in-polygon verification failed after import.');
        }

        console.log(`Imported ${documents.length} validated Sibuyan barangay boundaries from ${datasetPath}.`);
        console.log(`Verified point-in-polygon lookup: ${gutivan.name}, ${gutivan.municipalityName} (${gutivan.psgcCode}).`);
    } catch (error) {
        console.error(`Failed to import Sibuyan barangay boundaries: ${error.message}`);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
};

importBoundaries();
