import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load environment variables.
//
// The path is resolved against THIS FILE, not process.cwd(). A bare
// `dotenv.config()` looks for `./.env` relative to the working directory, so
// starting the server as `node server/server.js` from the repository root found
// no file, left every variable undefined, and the email path degraded silently:
// `isEmailConfigured()` returned false and both the password reset and the
// responder invitation reported "not configured" without ever attempting a send.
// Starting it as `npm run dev` from server/ worked, which is what made the
// failure look intermittent.
//
// dotenv does not overwrite variables that are already set, so a host that
// injects real config (Heroku) is unaffected by this either way.
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '.env') });

// Import configurations
import connectDB from './config/db.js';
import { configureProductionClient } from './config/clientApp.js';
import { validateRuntimeConfig } from './config/runtimeConfig.js';
import { configureWebPush } from './services/pushService.js';
import { ensureAnalyticsView } from './services/analyticsViewService.js';
import { initFaceDetector } from './services/faceDetectionService.js';
import { startDispatchEscalationSweeper } from './services/dispatchEscalationService.js';
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
import viewRoutes from './routes/views.js';
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

// Hazard layer readiness rides along for the same reason: an environment where
// the NOAH import was skipped would otherwise answer every pin with "no hazard
// here", which reads as a clear result instead of a missing dataset.
const hazardLayerStatus = { ready: false, count: 0, checked: false };
app.set('hazardLayerStatus', hazardLayerStatus);

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
    // Same reasoning as the boundary check above: a missing hazard dataset must
    // be visible in boot logs and /api/health, because the alternative is a map
    // that silently reports every location as hazard-free.
    try {
        const { default: HazardArea } = await import('./models/HazardArea.js');
        const { HAZARD_DATASET_IDS } = await import('./config/hazardDatasets.js');
        const hazardCount = await HazardArea.countDocuments({ isActive: true });
        const importedDatasets = await HazardArea.distinct('datasetId', { isActive: true });
        const missingDatasets = HAZARD_DATASET_IDS.filter((id) => !importedDatasets.includes(id));

        hazardLayerStatus.count = hazardCount;
        hazardLayerStatus.checked = true;
        hazardLayerStatus.ready = hazardCount > 0;
        hazardLayerStatus.datasets = importedDatasets;
        hazardLayerStatus.missingDatasets = missingDatasets;

        if (hazardCount === 0) {
            console.warn('⚠️ HazardArea is empty — zone placement will report every point as hazard-free. Fix: npm run import:hazards --prefix server (needs server/data/noah-sibuyan-*.geojson + MONGODB_URI)');
        } else {
            console.log(`⛰️ Hazard areas ready: ${hazardCount} across ${importedDatasets.length}/${HAZARD_DATASET_IDS.length} dataset(s)`);
            // A partially imported set is worth naming: an absent layer renders
            // as "no hazard here" for that hazard specifically.
            if (missingDatasets.length > 0) {
                console.warn(`⚠️ Hazard datasets not imported (their layers will report nothing): ${missingDatasets.join(', ')}`);
            }
        }
    } catch (error) {
        console.warn('⚠️ Hazard layer readiness check skipped:', error.message);
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

// Verify SMTP credentials early (fire-and-forget) so a bad app password is
// visible in boot logs instead of silent forgot-password failures.
import('./services/emailService.js').then(({ verifyEmailTransport }) => (
    verifyEmailTransport().catch(() => {})
)).catch(() => {});

// Middleware
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
}));

// Compression. Registered before the body parsers so every JSON response is
// eligible. This is the single largest win for weak-signal clients: incident
// JSON is highly repetitive (barangay names, addresses, repeated keys) and
// typically shrinks 70-85%. The middleware skips already-compressed types
// (images, PMTiles) via the `compressible` check, so media is unaffected.
app.use(compression({
    // Below this, the header overhead outweighs the saving.
    threshold: 1024,
    // Let the client's Accept-Encoding decide; never force compression.
    filter: (req, res) => {
        if (res.getHeader('Content-Encoding')) return false;
        return compression.filter(req, res);
    },
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
    const hazard = req.app.get('hazardLayerStatus') || hazardLayerStatus;
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
        hazardLayers: {
            ready: Boolean(hazard.ready),
            count: hazard.count || 0,
            checked: Boolean(hazard.checked),
            datasets: hazard.datasets || [],
            missingDatasets: hazard.missingDatasets || [],
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
app.use('/api/views', viewRoutes);

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

        // Reporters receive redacted live pins (new pending reports) here.
        // They never join municipality rooms, which stay operational-only.
        if (socket.data.user.role === 'reporter') {
            socket.join('reporters');
        }

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
            if (user.role === 'reporter') {
                socket.leave('reporters');
            }
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

// Background timers registered here are stopped during graceful shutdown.
// (Dispatch escalation sweeper, GridFS orphan sweeper, ...)
const backgroundStops = [];

export const startServer = async () => {
    validateRuntimeConfig(process.env);
    const { attachSocketRedisAdapter } = await import('./config/scaling.js');
    await attachSocketRedisAdapter(io, process.env);
    await initializeDatabase();

    // Silence must be treated as failure. With SMS out of scope, an alert that
    // no unit acknowledges would otherwise be indistinguishable from one that
    // was handled, so sweep for overdue incidents and re-page them. Every dyno
    // runs this; the atomic claim in the service makes concurrent sweeps safe.
    backgroundStops.push(startDispatchEscalationSweeper({ io }));

    if (!process.env.REDIS_URL?.trim()) {
        console.warn('⚠️ Single-dyno mode: in-memory rate limits + Socket.IO rooms. Scale past 1 web dyno only after setting REDIS_URL.');
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

/**
 * Graceful shutdown (P1-4).
 *
 * On SIGTERM/SIGINT (Heroku dyno restart, Ctrl+C): stop background timers,
 * stop accepting new connections, let in-flight requests finish, disconnect
 * Socket.IO clients, close MongoDB — all inside a 25s deadline so a hung
 * drain cannot block the restart. A SIGTERM arriving mid-request completes
 * the request before the process exits.
 */
let isShuttingDown = false;
export const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`🛑 ${signal} received: starting graceful shutdown`);

    const deadline = setTimeout(() => {
        console.error('🛑 Graceful shutdown exceeded 25s: forcing exit');
        process.exit(1);
    }, 25000);
    // The deadline must never hold the process open by itself.
    if (typeof deadline.unref === 'function') deadline.unref();

    try {
        // 1. Stop background timers so no new work is scheduled.
        for (const stop of backgroundStops) {
            try {
                stop();
            } catch (error) {
                console.error('Background stop failed:', error?.message || error);
            }
        }
        // 2. Stop accepting new connections. Idle keep-alive sockets are
        // dropped so close() only waits for genuinely in-flight requests.
        if (typeof httpServer.closeIdleConnections === 'function') {
            httpServer.closeIdleConnections();
        }
        await new Promise((resolve) => httpServer.close(resolve));
        // 3. Disconnect Socket.IO clients.
        await new Promise((resolve) => io.close(resolve));
        // 4. Close MongoDB.
        await mongoose.connection.close();

        clearTimeout(deadline);
        console.log('✅ Graceful shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('🛑 Graceful shutdown failed:', error);
        clearTimeout(deadline);
        process.exit(1);
    }
};

/**
 * Crash policy (P1-5). An uncaught exception means the process may be in a
 * corrupted state: log and exit so the host (Heroku) restarts clean instead
 * of serving from unknown state. Same for unhandled rejections.
 *
 * Exported (with the shutdown-signal registration below) so the policy is
 * covered by tests without spawning a child process.
 */
export const registerCrashHandlers = () => {
    process.on('unhandledRejection', (reason) => {
        console.error('❌ Unhandled Promise Rejection:', reason);
        process.exit(1);
    });

    process.on('uncaughtException', (error) => {
        console.error('❌ Uncaught Exception:', error);
        process.exit(1);
    });
};

export const registerShutdownHandlers = () => {
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
};

if (process.env.NODE_ENV !== 'test') {
    registerShutdownHandlers();
    registerCrashHandlers();

    startServer().catch((error) => {
        console.error(`Failed to start server: ${error.message}`);
        process.exit(1);
    });
}

export default app;
