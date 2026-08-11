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
import { authenticateAccessToken, protect } from './middleware/auth.js';
import { requireRole } from './middleware/roleCheck.js';
import { csrfProtection } from './middleware/csrf.js';
import { ACCESS_COOKIE_NAME } from './config/authConfig.js';
import { getCookieValue } from './services/authSessionService.js';
import { getOperationalOnlineUsers } from './utils/onlineOperationalUsers.js';

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

// Connect to MongoDB and seed data
const initializeDatabase = async () => {
    await connectDB();
    // Seed data after DB connection
    try {
        await seedMunicipalities();
        await seedAdmins();
        await seedMunicipalAdmins();
        await seedResponderAccounts();
    } catch (error) {
        console.warn('⚠️ Seeding warning:', error.message);
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
    res.status(databaseConnected ? 200 : 503).json({
        success: databaseConnected,
        service: 'sibuyan-accident-alert',
        database: databaseConnected ? 'connected' : 'unavailable',
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

// --- Online Users Tracking ---
const onlineUsers = new Map(); // socketId -> { userId, name, role, assignedMunicipality, agency, avatar, connectedAt }

const authenticateSocketRequest = async (socket) => {
    const token = getCookieValue(socket.handshake.headers.cookie, ACCESS_COOKIE_NAME);
    const identity = await authenticateAccessToken(token);
    return identity?.user || null;
};

// API endpoint: Get online users (for admin dashboard)
app.get('/api/admin/online-users', protect, requireRole('municipal_admin', 'responder'), async (req, res) => {
    const { municipality: requestedMunicipality } = req.query;
    const assignedMunicipality = req.user.assignedMunicipality;

    if (!assignedMunicipality) {
        return res.status(403).json({
            success: false,
            message: 'Municipality is not assigned to this account',
        });
    }

    if (requestedMunicipality && requestedMunicipality !== assignedMunicipality) {
        return res.status(403).json({
            success: false,
            message: 'Not authorized to view other municipalities',
        });
    }

    const municipality = assignedMunicipality;

    try {
        const uniqueUsers = getOperationalOnlineUsers(Array.from(onlineUsers.values()), municipality);
        res.json({
            success: true,
            data: uniqueUsers,
            total: uniqueUsers.length,
        });
    } catch (error) {
        console.error('Failed to load online users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get online users',
        });
    }
});

// Socket.io connection handling
io.on('connection', (socket) => {
    const getAuthenticatedUser = () => socket.data.user || null;
    // Join user-specific room and track online status
    socket.on('join', async () => {
        const userData = await authenticateSocketRequest(socket);

        if (!userData) {
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

        const userInfo = {
            userId: socket.data.user.id,
            socketId: socket.id,
            name: userData.name,
            role: userData.role,
            assignedMunicipality: userData.assignedMunicipality,
            agency: userData.agency,
            avatar: userData.avatar,
            connectedAt: new Date(),
        };
        onlineUsers.set(socket.id, userInfo);

        if (userData.assignedMunicipality) {
            io.to(`municipality_${userData.assignedMunicipality}`).emit('userOnline', userInfo);
        }

        io.emit('onlineUsersUpdate', {
            onlineCount: new Set(Array.from(onlineUsers.values()).map((u) => u.userId)).size,
        });
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

            const userInfo = onlineUsers.get(socket.id);
            onlineUsers.delete(socket.id);
            socket.data.user = null;

            const stillOnline = Array.from(onlineUsers.values()).some(
                (entry) => entry.userId === user.id
            );
            if (!stillOnline && userInfo?.assignedMunicipality) {
                io.to(`municipality_${userInfo.assignedMunicipality}`).emit('userOffline', {
                    userId: userInfo.userId,
                    name: userInfo.name,
                });
            }

            io.emit('onlineUsersUpdate', {
                onlineCount: new Set(Array.from(onlineUsers.values()).map((entry) => entry.userId)).size,
            });
        }
    });

    // Handle disconnection — remove from online tracking
    socket.on('disconnect', () => {
        const userData = onlineUsers.get(socket.id);
        if (userData) {
            onlineUsers.delete(socket.id);

            // Check if user still has other active sockets
            const stillOnline = Array.from(onlineUsers.values()).some(u => u.userId === userData.userId);

            if (!stillOnline) {
                // User fully disconnected — broadcast to municipality room
                if (userData.assignedMunicipality) {
                    io.to(`municipality_${userData.assignedMunicipality}`).emit('userOffline', {
                        userId: userData.userId,
                        name: userData.name,
                    });
                }
                io.emit('onlineUsersUpdate', {
                    onlineCount: new Set(Array.from(onlineUsers.values()).map(u => u.userId)).size,
                });
            }
        }
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
    console.error('❌ Error:', err);

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
    console.log('║   📋 Incident Types:                                           ║');
    console.log('║      • Accidents (vehicular, pedestrian, maritime)             ║');
    console.log('║      • Natural Disasters (flood, landslide, typhoon)           ║');
    console.log('║      • Fire Incidents (residential, forest, commercial)        ║');
    console.log('║                                                                ║');
    console.log('║   🏘️  Municipalities: Cajidiocan, Magdiwang, San Fernando      ║');
    console.log('║                                                                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    });
};

if (process.env.NODE_ENV !== 'test') {
    startServer().catch((error) => {
        console.error(`Failed to start server: ${error.message}`);
        process.exit(1);
    });
}

export default app;
