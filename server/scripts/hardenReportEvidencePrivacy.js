import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Report from '../models/Report.js';
import { GRID_FS_BUCKET_NAME, parseGridFsFileId } from '../services/gridFsService.js';

dotenv.config();

const execute = process.argv.includes('--execute');

const run = async () => {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
    await mongoose.connect(process.env.MONGODB_URI);

    const filesCollection = mongoose.connection.db.collection(`${GRID_FS_BUCKET_NAME}.files`);
    const reports = await Report.find({ 'images.0': { $exists: true } })
        .select('_id reporter municipalityName images')
        .lean();

    let discovered = 0;
    let updated = 0;

    for (const report of reports) {
        for (const imageUrl of report.images || []) {
            const fileId = parseGridFsFileId(imageUrl);
            if (!fileId) continue;
            discovered += 1;
            if (!execute) continue;

            const result = await filesCollection.updateOne(
                { _id: fileId },
                {
                    $set: {
                        'metadata.visibility': 'private',
                        'metadata.category': 'report_evidence',
                        'metadata.resourceId': report._id,
                        'metadata.ownerId': report.reporter,
                        'metadata.municipalityName': report.municipalityName || null,
                    },
                },
            );
            updated += result.modifiedCount;
        }
    }

    console.log(JSON.stringify({ mode: execute ? 'execute' : 'dry-run', discovered, updated }, null, 2));
};

run()
    .catch((error) => {
        console.error('Report evidence privacy migration failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
