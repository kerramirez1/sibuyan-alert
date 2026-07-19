import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import User from './models/User.js';

// Load environment variables
dotenv.config();

// Import configurations
import connectDB from './config/db.js';
import { configureWebPush } from './services/pushService.js';
import { protect } from './middleware/auth.js';
import { requireRole } from './middleware/roleCheck.js';

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

initializeDatabase();

// Configure Web Push
configureWebPush();

// Middleware
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

const authenticateSocketToken = async (token) => {
    if (!token) return null;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('name role assignedMunicipality agency avatar isOnDuty');
        return user || null;
    } catch (error) {
        return null;
    }
};

// API endpoint: Get online users (for admin dashboard)
app.get('/api/admin/online-users', protect, requireRole('admin', 'municipal_admin', 'responder'), async (req, res) => {
    const { municipality: requestedMunicipality } = req.query;
    let municipality = requestedMunicipality;

    if (['municipal_admin', 'responder'].includes(req.user.role) && req.user.assignedMunicipality) {
        if (requestedMunicipality && requestedMunicipality !== req.user.assignedMunicipality) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view other municipalities',
            });
        }
        municipality = req.user.assignedMunicipality;
    }

    const users = Array.from(onlineUsers.values());

    // Filter by municipality if specified
    const filtered = municipality
        ? users.filter(u => u.assignedMunicipality === municipality)
        : users;

    // Deduplicate by userId (a user might have multiple tabs/sockets)
    const uniqueUsers = [];
    const seen = new Set();
    for (const u of filtered) {
        if (!seen.has(u.userId)) {
            seen.add(u.userId);
            uniqueUsers.push(u);
        }
    }

    try {
        const userIds = uniqueUsers.map((u) => u.userId);
        const dutyRows = await User.find({ _id: { $in: userIds } }).select('_id isOnDuty');
        const dutyMap = new Map(dutyRows.map((row) => [row._id.toString(), row.isOnDuty]));

        const enrichedUsers = uniqueUsers.map((u) => ({
            ...u,
            isOnDuty: dutyMap.has(u.userId) ? dutyMap.get(u.userId) !== false : true,
        }));

        res.json({
            success: true,
            data: enrichedUsers,
            total: enrichedUsers.length,
        });
    } catch (error) {
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
    socket.on('join', async (payload) => {
        const userData = await authenticateSocketToken(payload?.token);

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

        if (socket.data.user.role === 'admin') {
            socket.join('role_admin');
        }

        // Authentication and authorization are complete at this point, so join
        // all permitted rooms here instead of relying on follow-up client events.
        if (socket.data.user.assignedMunicipality) {
            socket.join(`municipality_${socket.data.user.assignedMunicipality}`);

            if (['responder', 'municipal_admin'].includes(socket.data.user.role)) {
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
            isOnDuty: userData.isOnDuty !== false,
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

        if (user.assignedMunicipality && user.assignedMunicipality !== municipalityCode) {
            socket.emit('authError', { message: 'Unauthorized municipality access' });
            return;
        }

        socket.join(`municipality_${municipalityCode}`);
    });

    // Join responder room (for responder accounts only)
    socket.on('joinResponderRoom', (municipalityCode) => {
        const user = getAuthenticatedUser();
        if (!municipalityCode || !user) return;

        if (!['responder', 'municipal_admin'].includes(user.role)) {
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
            socket.leave('role_admin');
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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Error:', err);

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
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

httpServer.listen(PORT, () => {
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

export default app;


