import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';

dotenv.config();

const execute = process.argv.includes('--execute');

const run = async () => {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is required');
    }

    await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 20000,
        socketTimeoutMS: 45000,
        family: 4,
    });

    const legacyAccounts = await User.find({ role: 'admin' })
        .select('_id email name')
        .lean();

    if (legacyAccounts.length === 0) {
        console.log('No legacy system-administrator accounts were found.');
        return;
    }

    console.log(`Found ${legacyAccounts.length} legacy system-administrator account(s):`);
    legacyAccounts.forEach((account) => {
        console.log(`- ${account.email} (${account._id})`);
    });

    if (!execute) {
        console.log('Dry run only. Re-run with --execute to permanently delete these accounts.');
        return;
    }

    const result = await User.deleteMany({
        _id: { $in: legacyAccounts.map((account) => account._id) },
        role: 'admin',
    });

    console.log(`Deleted ${result.deletedCount} legacy system-administrator account(s).`);
};

try {
    await run();
} catch (error) {
    console.error(`System-administrator migration failed: ${error.message}`);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
