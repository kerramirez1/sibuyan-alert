import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { ANALYTICS_VIEW_NAME, ensureAnalyticsView } from '../services/analyticsViewService.js';

const createAnalyticsView = async () => {
    try {
        await connectDB();
        const result = await ensureAnalyticsView(mongoose.connection);
        console.log(`✅ D7 ${result.name} (${ANALYTICS_VIEW_NAME}) ${result.action} — viewOn: reports`);
    } catch (error) {
        console.error(`❌ Failed to create analytics view: ${error.message}`);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
};

createAnalyticsView();
