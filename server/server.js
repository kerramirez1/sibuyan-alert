import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Load environment variables
dotenv.config();

// Import configurations
import connectDB from './config/db.js';
import { configureProductionClient } from './config/clientApp.js';
import { validateRuntimeConfig } from './config/runtimeConfig.js';
import { configureWebPush } from './services/pushService.js';
import { ensureAnalyticsView } from './services/analyticsViewService.js';
import { initFaceDetector } from './services/faceDetectionService.js';
import { authenticateAccessToken } from './middleware/auth.js';
import { csrfProtection } from './middleware/csrf.js';
import { ACCESS_COOKIE_NAME } from './config/authConfig.js';
import { getCookieValue } from './services/authSessionService.js';

// Import seeds
import { seedMunicipalities } from './seeds/municipalitySeed.js';
import { seedAdmins } from './seeds/adminSeed.js';
import { seedMunicipalAdmins } from './seeds/municipalAdminSeed.js';
import { seedResponderAccounts } from './seeds/responderAccountSeed.js';

// Import routes
import authRoutes from './routes/auth.js';
import reportRoutes from './routes/reports.js';
import adminRoutes from './routes/admin.js';
import notificationRoutes from './routes/notifications.js';
import highRiskZonesRoutes from './routes/highRiskZones.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import fileRoutes from './routes/files.js';

// Initialize Express app
const app = express();
const httpServer = createServer(app);

if (process.env.NODE_ENV === 'production') {
    // Heroku terminates TLS at its router. Trust only the first proxy so rate
    // limiting and secure request metadata use the real client address.
    app.set('trust proxy', 1);
}

// Initialize Socket.io
const io = new Server(httpServer, {
    cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

// Make io accessible to routes
app.set('io', io);

// MVP ops visibility: boundary import status is served via /api/health so a
// fresh DB without polygons is caught during deploy verification.
const boundaryStatus = { ready: false, count: 0, checked: false };
app.set('boundaryStatus', boundaryStatus);

// Connect to MongoDB and seed data
const initializeDatabase = async () => {
    await connectDB();
    // Warm the pico face cascade so the first registration selfie check
    // does not pay the cold-load cost (disk read or remote fetch).
    try {
        await initFaceDetector();
    } catch (error) {
        console.warn('⚠️ Face detector warm-up failed (will retry per-request):', error.message);
    }
    // Seed data after DB connection
    try {
        await seedMunicipalities();
        await seedAdmins();
        await seedMunicipalAdmins();
        await seedResponderAccounts();
    } catch (error) {
        console.warn('⚠️ Seeding warning:', error.message);
    }
    // Fail-closed boundary check stays, but surface a clear ops warning so a
    // fresh DB without `barangayboundaries` doesn't silently 400 border reports.
    try {
        const { default: BarangayBoundary } = await import('./models/BarangayBoundary.js');
        const boundaryCount = await BarangayBoundary.countDocuments({ isActive: true });
        boundaryStatus.count = boundaryCount;
        boundaryStatus.checked = true;
        boundaryStatus.ready = boundaryCount > 0;
        if (boundaryCount === 0) {
            console.warn('⚠️ BarangayBoundary is empty — road-accident border reports will 400 as ambiguous. Fix: npm run import:barangay-boundaries --prefix server (needs server/data/psa-georisk-sibuyan-barangays.geojson + MONGODB_URI)');
        } else {
            console.log(`🗺️ Barangay boundaries ready: ${boundaryCount} active polygons`);
        }
    } catch (error) {
        console.warn('⚠️ Boundary readiness check skipped:', error.message);
    }
    // D7 Analytics / Historical Data is a read-only view on reports — ensure it
    // exists without ever failing the boot (analytics degrades to live
    // aggregation when the view cannot be created, e.g. restricted DB roles).
    try {
        const view = await ensureAnalyticsView(mongoose.connection);
        console.log(`📊 Analytics view ready: ${view.name} (${view.action})`);
    } catch (error) {
        console.warn('⚠️ Analytics view warning:', error.message);
    }
};

// Configure Web Push
configureWebPush();

// Middleware
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});
app.use(csrfProtection);
app.use('/api/auth', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Pragma', 'no-cache');
    next();
});

app.get('/api/health', (req, res) => {
    const databaseConnected = mongoose.connection.readyState === 1;
    const status = req.app.get('boundaryStatus') || boundaryStatus;
    res.status(databaseConnected ? 200 : 503).json({
        success: databaseConnected,
        service: 'sibuyan-accident-alert',
        scope: 'road-accidents-mvp',
        database: databaseConnected ? 'connected' : 'unavailable',
        boundaries: {
            ready: Boolean(status.ready),
            count: status.count || 0,
            checked: Boolean(status.checked),
        },
    });
});

// API Routes
app.use('/api/files', fileRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/high-risk-zones', highRiskZonesRoutes);
app.use('/api/analytics', analyticsRoutes);

// Socket.io connection handling
// NOTE: Operational presence tracking (online-users Map, userOnline/userOffline
// broadcasts, GET /api/admin/online-users) was removed as out of scope.
// Room joins below serve incident alerts only.
const authenticateSocketRequest = async (socket) => {
    const token = getCookieValue(socket.handshake.headers.cookie, ACCESS_COOKIE_NAME);
    const identity = await authenticateAccessToken(token);
    return identity?.user || null;
};
io.on('connection', (socket) => {
    const getAuthenticatedUser = () => socket.data.user || null;
    // Join user-specific room for incident alerts.
    socket.on('join', async () => {
        let userData = null;
        try {
            userData = await authenticateSocketRequest(socket);
        } catch (error) {
            console.error('Socket authentication error:', error.message);
            socket.emit('authError', { message: 'Authentication service unavailable' });
            return;
        }

        if (!userData || !userData._id) {
            socket.emit('authError', { message: 'Invalid or missing socket token' });
            return;
        }

        socket.data.user = {
            id: userData._id.toString(),
            role: userData.role,
            assignedMunicipality: userData.assignedMunicipality,
        };

        socket.join(`user_${socket.data.user.id}`);

        // Authentication and authorization are complete at this point, so join
        // all permitted rooms here instead of relying on follow-up client events.
        if (
            socket.data.user.assignedMunicipality
            && ['municipal_admin', 'responder'].includes(socket.data.user.role)
        ) {
            socket.join(`municipality_${socket.data.user.assignedMunicipality}`);

            if (socket.data.user.role === 'responder') {
                socket.join(`municipality_${socket.data.user.assignedMunicipality}_responders`);
            }
        }
    });

    // Join municipality room for local alerts
    socket.on('joinMunicipality', (municipalityCode) => {
        const user = getAuthenticatedUser();
        if (!municipalityCode || !user) return;

        if (
            !['municipal_admin', 'responder'].includes(user.role)
            || !user.assignedMunicipality
            || user.assignedMunicipality !== municipalityCode
        ) {
            socket.emit('authError', { message: 'Unauthorized municipality access' });
            return;
        }

        socket.join(`municipality_${municipalityCode}`);
    });

    // Join responder room (for responder accounts only)
    socket.on('joinResponderRoom', (municipalityCode) => {
        const user = getAuthenticatedUser();
        if (!municipalityCode || !user) return;

        if (user.role !== 'responder') {
            socket.emit('authError', { message: 'Responder access required' });
            return;
        }

        if (user.assignedMunicipality !== municipalityCode) {
            socket.emit('authError', { message: 'Unauthorized responder room access' });
            return;
        }
        if (municipalityCode) {
            const responderRoom = `municipality_${municipalityCode}_responders`;
            socket.join(responderRoom);
            console.log(`👮 Responder joined room: ${responderRoom}`);
        }
    });

    // Leave user room
    socket.on('leave', () => {
        const user = getAuthenticatedUser();
        if (user) {
            socket.leave(`user_${user.id}`);
            if (user.assignedMunicipality) {
                socket.leave(`municipality_${user.assignedMunicipality}`);
                socket.leave(`municipality_${user.assignedMunicipality}_responders`);
            }

            socket.data.user = null;
        }
    });

    // Handle disconnection — room membership is cleaned up automatically.
    socket.on('disconnect', () => {
        socket.data.user = null;
    });
});

// Keep unknown API requests as JSON and never hand them to the SPA router.
app.use('/api', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API route not found',
    });
});

// In production this serves the Vite build and client-side routes. In
// development Vite continues to run independently with its API proxy.
configureProductionClient(app);

// Error handling middleware
app.use((err, req, res, _next) => {
    // Malformed JSON bodies (e.g. a literal "null" payload) are client errors —
    // one-line warn instead of a full stack trace flooding dev logs.
    if (err?.type === 'entity.parse.failed') {
        console.warn(`⚠️ Bad JSON body on ${req.method} ${req.originalUrl}: ${err.message}`);
    } else {
        console.error('❌ Error:', err);
    }

    const status = Number.isInteger(err.status) && err.status >= 400 && err.status <= 599
        ? err.status
        : 500;
    const exposeDetails = status < 500 || process.env.NODE_ENV === 'development';

    res.status(status).json({
        success: false,
        message: exposeDetails && err.message ? err.message : 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
    });
});

// Start server
const PORT = process.env.PORT || 5000;

export const startServer = async () => {
    validateRuntimeConfig(process.env);
    await initializeDatabase();
    if (!process.env.REDIS_URL?.trim()) {
        console.warn('⚠️ Single-dyno mode: in-memory rate limits + Socket.IO rooms. Scale past 1 web dyno only after adding a shared store.');
    }

    return httpServer.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                                                                ║');
    console.log('║   🚨 SIBUYAN ISLAND EMERGENCY ALERT SYSTEM - API v2.0 🚨      ║');
    console.log('║                                                                ║');
    console.log(`║   🌐 Server:      http://localhost:${PORT}                         ║`);
    console.log(`║   📡 Environment: ${(process.env.NODE_ENV || 'development').padEnd(13)}                           ║`);
    console.log('║   🔌 Socket.io:   Enabled                                      ║');
    console.log('║   📍 Location:    Sibuyan Island, Romblon                      ║');
    console.log('║                                                                ║');
    console.log('║   📋 Incident Types (MVP):                                     ║');
    console.log('║      • Road Accidents only                                     ║');
    console.log('║        (vehicular, motorcycle, pedestrian, bicycle,            ║');
    console.log('║         self-accident, mechanical, other)                      ║');
    console.log('║                                                                ║');
    console.log('║   🏘️  Municipalities: Cajidiocan, Magdiwang, San Fernando      ║');
    console.log('║                                                                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    });
};

if (process.env.NODE_ENV !== 'test') {
    process.on('unhandledRejection', (reason) => {
        console.error('❌ Unhandled Promise Rejection:', reason);
    });

    process.on('uncaughtException', (error) => {
        console.error('❌ Uncaught Exception:', error);
    });

    startServer().catch((error) => {
        console.error(`Failed to start server: ${error.message}`);
        process.exit(1);
    });
}

export default app;
