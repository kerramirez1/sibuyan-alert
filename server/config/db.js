import mongoose from 'mongoose';

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

const connectDB = async (retries = 3) => {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri || !mongoUri.trim()) {
        console.error('❌ MongoDB connection failed: MONGODB_URI is not configured');
        process.exit(1);
    }

    let lastError = null;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            const conn = await mongoose.connect(mongoUri, {
                serverSelectionTimeoutMS: 20000, // Increase timeout to 20s
                socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
                family: 4 // Use IPv4, skip trying IPv6
            });

            console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

            registerConnectionListeners();

            return conn;
        } catch (error) {
            lastError = error;
            console.error(`❌ MongoDB connection attempt ${attempt}/${retries} failed: ${error.message}`);
            if (attempt < retries) {
                const backoffMs = 1000 * attempt;
                await new Promise((resolve) => setTimeout(resolve, backoffMs));
            }
        }
    }

    console.error(`❌ MongoDB connection failed after ${retries} attempts: ${lastError?.message}`);
    process.exit(1);
};

export default connectDB;
