/**
 * One-time database migration: `test` -> `SibuyanAlertSystem`.
 *
 * Context: the production MONGODB_URI carried no database path, so Mongoose
 * fell back to its default database name `test`. This copies every collection
 * (users, authsessions, reports, notifications, municipalities,
 * barangayboundaries, highriskzones, GridFS media.files/media.chunks, …)
 * into the properly named database while preserving _ids and references.
 *
 * Usage:
 *   node scripts/migrateDatabase.js \
 *     --source "mongodb+srv://<user>:<pass>@cluster0.x.mongodb.net/" \
 *     --dest   "mongodb+srv://<user>:<pass>@cluster0.x.mongodb.net/SibuyanAlertSystem"
 *
 * Falls back to MONGODB_SOURCE_URI / MONGODB_URI env vars. The destination
 * database is created implicitly on first write. Re-runs are safe: collections
 * that already hold documents are skipped. The source database is NEVER
 * dropped by this script — drop it manually in Atlas only after verifying.
 */
import mongoose from 'mongoose';

const parseArgs = () => {
    const args = { source: process.env.MONGODB_SOURCE_URI || '', dest: process.env.MONGODB_URI || '' };
    for (let i = 2; i < process.argv.length; i += 1) {
        if (process.argv[i] === '--source') args.source = process.argv[i + 1] || '';
        if (process.argv[i] === '--dest') args.dest = process.argv[i + 1] || '';
    }
    return args;
};

const migrateDatabase = async () => {
    const { source, dest } = parseArgs();
    if (!source || !dest) {
        console.error('❌ Both --source and --dest MongoDB URIs are required.');
        process.exitCode = 1;
        return;
    }

    const sourceConn = mongoose.createConnection();
    const destConn = mongoose.createConnection();
    try {
        await sourceConn.openUri(source, { serverSelectionTimeoutMS: 20000, family: 4 });
        await destConn.openUri(dest, { serverSelectionTimeoutMS: 20000, family: 4 });
        console.log(`📥 Source: ${sourceConn.name}`);
        console.log(`📤 Destination: ${destConn.name}`);

        if (sourceConn.name === destConn.name) {
            console.error('❌ Source and destination resolve to the same database. Aborting.');
            process.exitCode = 1;
            return;
        }

        const collections = await sourceConn.db.listCollections().toArray();
        const dataCollections = collections.filter((c) => !String(c.name).startsWith('system.'));
        console.log(`📚 Found ${dataCollections.length} data collections to copy.`);

        let totalCopied = 0;
        for (const { name } of dataCollections) {
            const sourceDocs = await sourceConn.db.collection(name).find({}).toArray();
            if (sourceDocs.length === 0) {
                console.log(`   ⏭️  ${name}: empty, skipped`);
                continue;
            }
            const destCount = await destConn.db.collection(name).countDocuments();
            if (destCount > 0) {
                console.log(`   ⏭️  ${name}: destination already has ${destCount} docs, skipped`);
                continue;
            }
            await destConn.db.collection(name).insertMany(sourceDocs, { ordered: true });
            totalCopied += sourceDocs.length;
            console.log(`   ✅ ${name}: copied ${sourceDocs.length} documents`);
        }

        console.log(`\n🎉 Migration complete: ${totalCopied} documents copied to "${destConn.name}".`);
        console.log('   Model indexes rebuild automatically on next app boot (autoIndex).');
        console.log('   Verify the app against the new database BEFORE dropping the old one.');
    } catch (error) {
        console.error(`❌ Migration failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        await sourceConn.close().catch(() => {});
        await destConn.close().catch(() => {});
    }
};

migrateDatabase();
