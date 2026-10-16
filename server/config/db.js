import mongoose from 'mongoose';

/**
 * Boot-time MongoDB connection budget.
 *
 * Heroku's R10 boot timeout kills a web dyno that has not bound $PORT within
 * 60 seconds. The retry loop must therefore stay comfortably under that:
 * (attempts x serverSelectionTimeoutMS) + total backoff <= ~40s, so the real
 * MongoDB error is logged and the process exits on its own instead of being
 * masked by an R10 crash loop.
 *
 * Both knobs are env-overridable (same parse-and-fallback pattern as
 * dispatchPolicy.js): a malformed or absent value falls back to the default,
 * never NaN.
 */
const DB_CONNECT_DEFAULTS = Object.freeze({
    attempts: 3,
    serverSelectionTimeoutMS: 10000,
});

const readPositiveInt = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const resolveConnectAttempts = (retries) => readPositiveInt(
    retries ?? process.env.MONGODB_CONNECT_ATTEMPTS,
    DB_CONNECT_DEFAULTS.attempts
);

const resolveServerSelectionTimeoutMs = () => readPositiveInt(
    process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    DB_CONNECT_DEFAULTS.serverSelectionTimeoutMS
);

const registerConnectionListeners = () => {
    if (mongoose.connection.listenerCount('error') === 0) {
        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error(`❌ MongoDB connection error: ${err}`);
        });
    }

    if (mongoose.connection.listenerCount('disconnected') === 0) {
        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
        });
    }

    if (mongoose.connection.listenerCount('reconnected') === 0) {
        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected');
        });
    }
};

const connectDB = async (retries = process.env.MONGODB_CONNECT_ATTEMPTS) => {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri || !mongoUri.trim()) {
        console.error('❌ MongoDB connection failed: MONGODB_URI is not configured');
        process.exit(1);
    }

    // Resolved once so a malformed env var can never stretch the boot
    // budget past Heroku's 60s R10 timeout mid-loop.
    const attempts = resolveConnectAttempts(retries);
    const serverSelectionTimeoutMS = resolveServerSelectionTimeoutMs();

    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const conn = await mongoose.connect(mongoUri, {
                serverSelectionTimeoutMS,
                socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
                family: 4 // Use IPv4, skip trying IPv6
            });

            console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

            registerConnectionListeners();

            return conn;
        } catch (error) {
            lastError = error;
            console.error(`❌ MongoDB connection attempt ${attempt}/${attempts} failed: ${error.message}`);
            if (attempt < attempts) {
                const backoffMs = 1000 * attempt;
                await new Promise((resolve) => setTimeout(resolve, backoffMs));
            }
        }
    }

    console.error(`❌ MongoDB connection failed after ${attempts} attempts: ${lastError?.message}`);
    process.exit(1);
};

export default connectDB;
