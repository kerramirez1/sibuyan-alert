import dotenv from 'dotenv';
import fs from 'fs/promises';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import Report from '../models/Report.js';
import {
    deleteGridFsFileByUrl,
    uploadFileToGridFS,
} from '../services/gridFsService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const uploadsRoot = path.resolve(serverRoot, 'uploads');
const execute = process.argv.includes('--execute');
const MAX_MIGRATION_FILE_SIZE = 10 * 1024 * 1024;

const isLegacyMediaUrl = (value) => typeof value === 'string' && (
    /^https?:\/\/res\.cloudinary\.com\//i.test(value)
    || value.startsWith('/uploads/')
);

const loadLegacyFile = async (url) => {
    if (url.startsWith('/uploads/')) {
        const relativePath = url.slice('/uploads/'.length).replaceAll('/', path.sep);
        const absolutePath = path.resolve(uploadsRoot, relativePath);
        if (!absolutePath.startsWith(`${uploadsRoot}${path.sep}`)) {
            throw new Error('Unsafe legacy upload path');
        }

        const buffer = await fs.readFile(absolutePath);
        return {
            buffer,
            originalname: path.basename(absolutePath),
            mimetype: inferMimeType(absolutePath),
        };
    }

    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
        throw new Error(`Remote file returned HTTP ${response.status}`);
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_MIGRATION_FILE_SIZE) {
        throw new Error('Legacy file exceeds the 10 MB migration limit');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_MIGRATION_FILE_SIZE) {
        throw new Error('Legacy file exceeds the 10 MB migration limit');
    }

    const remotePath = new URL(response.url).pathname;
    return {
        buffer,
        originalname: path.basename(remotePath) || 'legacy-file',
        mimetype: response.headers.get('content-type')?.split(';')[0] || inferMimeType(remotePath),
    };
};

function inferMimeType(filename) {
    const extension = path.extname(filename).toLowerCase();
    return ({
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.pdf': 'application/pdf',
    })[extension] || 'application/octet-stream';
}

const migrateReference = async ({ url, ownerId, municipalityName, category, visibility }) => {
    const file = await loadLegacyFile(url);
    return uploadFileToGridFS(file, {
        ownerId,
        municipalityName,
        category,
        visibility,
    });
};

const migrateUser = async (user) => {
    const fieldDefinitions = [
        ['avatar', 'avatar', 'public'],
        ['idDocument', 'identity_document', 'private'],
        ['selfiePhoto', 'identity_selfie', 'private'],
    ];
    let migrated = 0;

    for (const [field, category, visibility] of fieldDefinitions) {
        const oldUrl = user[field];
        if (!isLegacyMediaUrl(oldUrl)) continue;

        const stored = await migrateReference({
            url: oldUrl,
            ownerId: user._id,
            municipalityName: user.assignedMunicipality,
            category,
            visibility,
        });

        try {
            await User.updateOne({ _id: user._id, [field]: oldUrl }, { $set: { [field]: stored.url } });
            migrated += 1;
        } catch (error) {
            await deleteGridFsFileByUrl(stored.url);
            throw error;
        }
    }

    return migrated;
};

const migrateReport = async (report) => {
    const oldImages = report.images || [];
    const newImages = [...oldImages];
    const storedUrls = [];
    let migrated = 0;

    try {
        for (let index = 0; index < oldImages.length; index += 1) {
            if (!isLegacyMediaUrl(oldImages[index])) continue;
            const stored = await migrateReference({
                url: oldImages[index],
                ownerId: report.reporter,
                municipalityName: report.municipalityName,
                category: 'report_evidence',
                visibility: 'public',
            });
            newImages[index] = stored.url;
            storedUrls.push(stored.url);
            migrated += 1;
        }

        if (migrated) {
            await Report.updateOne({ _id: report._id }, { $set: { images: newImages } });
        }
        return migrated;
    } catch (error) {
        await Promise.allSettled(storedUrls.map((url) => deleteGridFsFileByUrl(url)));
        throw error;
    }
};

const run = async () => {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
    await mongoose.connect(process.env.MONGODB_URI);

    const [users, reports] = await Promise.all([
        User.find({
            $or: [
                { avatar: { $regex: '^(https?://res\\.cloudinary\\.com/|/uploads/)', $options: 'i' } },
                { idDocument: { $regex: '^(https?://res\\.cloudinary\\.com/|/uploads/)', $options: 'i' } },
                { selfiePhoto: { $regex: '^(https?://res\\.cloudinary\\.com/|/uploads/)', $options: 'i' } },
            ],
        }).select('avatar idDocument selfiePhoto assignedMunicipality'),
        Report.find({ images: { $elemMatch: { $regex: '^(https?://res\\.cloudinary\\.com/|/uploads/)', $options: 'i' } } })
            .select('images reporter municipalityName'),
    ]);

    const referenceCount = users.reduce((count, user) =>
        count + ['avatar', 'idDocument', 'selfiePhoto'].filter((field) => isLegacyMediaUrl(user[field])).length, 0
    ) + reports.reduce((count, report) =>
        count + report.images.filter(isLegacyMediaUrl).length, 0
    );

    console.log(`Found ${referenceCount} legacy media reference(s) in ${users.length} user(s) and ${reports.length} report(s).`);
    if (!execute) {
        console.log('Dry run only. Re-run with --execute to copy files into GridFS and update references.');
        return;
    }

    let migrated = 0;
    const failures = [];
    for (const user of users) {
        try {
            migrated += await migrateUser(user);
        } catch (error) {
            failures.push(`User ${user._id}: ${error.message}`);
        }
    }
    for (const report of reports) {
        try {
            migrated += await migrateReport(report);
        } catch (error) {
            failures.push(`Report ${report._id}: ${error.message}`);
        }
    }

    console.log(`Migrated ${migrated} media reference(s) to MongoDB GridFS.`);
    if (failures.length) {
        failures.forEach((failure) => console.error(failure));
        process.exitCode = 1;
    }
};

run()
    .catch((error) => {
        console.error('GridFS migration failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
