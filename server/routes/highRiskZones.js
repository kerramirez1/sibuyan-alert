import express from 'express';
import HighRiskZone from '../models/HighRiskZone.js';
import { protect } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { sortHighRiskZonesBySeverity } from '../utils/highRiskZones.js';

const router = express.Router();

/**
 * @route   GET /api/high-risk-zones
 * @desc    Get all active high-risk zones (public)
 * @access  Public
 */
router.get('/', async (req, res) => {
    try {
        const { municipality } = req.query;
        const query = { isActive: true };

        if (municipality) {
            query.municipality = municipality;
        }

        const zones = await HighRiskZone.find(query)
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 });
        const prioritizedZones = sortHighRiskZonesBySeverity(zones);

        res.json({
            success: true,
            data: prioritizedZones,
        });
    } catch (error) {
        console.error('Get high-risk zones error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get high-risk zones',
        });
    }
});

/**
 * @route   POST /api/high-risk-zones
 * @desc    Create a new high-risk zone
 * @access  Private (admin only)
 */
router.post('/', protect, requireRole('admin', 'municipal_admin'), async (req, res) => {
    try {
        const { name, description, type, coordinates, radius, severity, municipality } = req.body;
        const admin = req.user;

        // Municipal admins can only create zones in their jurisdiction
        const targetMunicipality = admin.assignedMunicipality || municipality;

        if (admin.assignedMunicipality && municipality && municipality !== admin.assignedMunicipality) {
            return res.status(403).json({
                success: false,
                message: 'You can only create zones in your assigned municipality',
            });
        }

        if (!targetMunicipality) {
            return res.status(400).json({
                success: false,
                message: 'Municipality is required',
            });
        }

        const zone = await HighRiskZone.create({
            name,
            description,
            type,
            coordinates,
            radius: radius || 100,
            severity: severity || 'medium',
            municipality: targetMunicipality,
            createdBy: admin._id,
        });

        // Emit socket event for real-time update
        const io = req.app.get('io');
        if (io) {
            io.emit('highRiskZoneCreated', zone);
        }

        res.status(201).json({
            success: true,
            message: 'High-risk zone created successfully',
            data: zone,
        });
    } catch (error) {
        console.error('Create high-risk zone error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create high-risk zone',
        });
    }
});

/**
 * @route   PUT /api/high-risk-zones/:id
 * @desc    Update a high-risk zone
 * @access  Private (admin only)
 */
router.put('/:id', protect, requireRole('admin', 'municipal_admin'), async (req, res) => {
    try {
        const zone = await HighRiskZone.findById(req.params.id);
        const admin = req.user;

        if (!zone) {
            return res.status(404).json({
                success: false,
                message: 'High-risk zone not found',
            });
        }

        // Check authorization
        if (admin.assignedMunicipality && zone.municipality !== admin.assignedMunicipality) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this zone',
            });
        }

        const { name, description, type, coordinates, radius, severity, isActive } = req.body;

        if (name) zone.name = name;
        if (description !== undefined) zone.description = description;
        if (type) zone.type = type;
        if (coordinates) zone.coordinates = coordinates;
        if (radius) zone.radius = radius;
        if (severity) zone.severity = severity;
        if (isActive !== undefined) zone.isActive = isActive;

        await zone.save();

        const io = req.app.get('io');
        if (io) {
            io.emit('highRiskZoneUpdated', zone);
        }

        res.json({
            success: true,
            message: 'High-risk zone updated successfully',
            data: zone,
        });
    } catch (error) {
        console.error('Update high-risk zone error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update high-risk zone',
        });
    }
});

/**
 * @route   DELETE /api/high-risk-zones/:id
 * @desc    Delete a high-risk zone
 * @access  Private (admin only)
 */
router.delete('/:id', protect, requireRole('admin', 'municipal_admin'), async (req, res) => {
    try {
        const zone = await HighRiskZone.findById(req.params.id);
        const admin = req.user;

        if (!zone) {
            return res.status(404).json({
                success: false,
                message: 'High-risk zone not found',
            });
        }

        // Check authorization
        if (admin.assignedMunicipality && zone.municipality !== admin.assignedMunicipality) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this zone',
            });
        }

        await zone.deleteOne();

        const io = req.app.get('io');
        if (io) {
            io.emit('highRiskZoneDeleted', { id: req.params.id });
        }

        res.json({
            success: true,
            message: 'High-risk zone deleted successfully',
        });
    } catch (error) {
        console.error('Delete high-risk zone error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete high-risk zone',
        });
    }
});

export default router;
