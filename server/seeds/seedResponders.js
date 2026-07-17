import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { seedResponderAccounts } from './responderAccountSeed.js';

dotenv.config();

const run = async () => {
    try {
        await connectDB();
        await seedResponderAccounts();
        console.log('Responder accounts are ready.');
        process.exit(0);
    } catch (error) {
        console.error('Failed to seed responder accounts:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect().catch(() => {});
    }
};

run();
