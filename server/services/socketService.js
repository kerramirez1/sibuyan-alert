/**
 * Socket.IO Service for Alert Broadcasting
 * Centralized service for managing real-time notifications and alerts
 */
import { buildReportEvidenceObject } from '../utils/publicReport.js';

/**
 * Broadcast verified report alert to all responder units in a municipality
 * @param {Object} io - Socket.IO instance
 * @param {Object} report - The verified report document
 * @param {String} municipalityId - Municipality ObjectId or name
 */
export const broadcastVerifiedReportToResponders = (io, report, municipalityId) => {
    if (!io) {
        console.warn('⚠️ Socket.IO instance not available');
        return;
    }

    const alertData = {
        id: report._id,
        incidentCategory: report.incidentCategory,
        incidentType: report.incidentType,
        title: report.title,
        description: report.description,
        address: report.address,
        barangay: report.barangay,
        municipalityName: report.municipalityName,
        coordinates: report.coordinates,
        incidentTime: report.incidentTime,
        severity: report.severity,
        priority: report.priority,
        casualties: report.casualties,
        verifiedAt: report.verifiedAt,
        timestamp: new Date(),
    };

    // Broadcast to municipality-specific responder room
    const responderRoom = `municipality_${municipalityId}_responders`;
    io.to(responderRoom).emit('reportVerifiedAlert', alertData);

    console.log(`🚨 Alert broadcasted to ${responderRoom}:`, {
        reportId: report._id,
        location: report.address,
        severity: report.severity,
    });
};

/**
 * Broadcast multi-unit response notification
 * @param {Object} io - Socket.IO instance
 * @param {Object} report - The report document
 * @param {Object} responder - The responder who just responded
 * @param {String} unitName - Name of the responding unit
 * @param {String} unitType - Type of the responding unit
 */
export const broadcastMultiUnitResponse = (io, report, responder, unitName, unitType) => {
    if (!io) {
        console.warn('⚠️ Socket.IO instance not available');
        return;
    }

    const firstResponderEntry = report.responders?.[0];
    const firstRespondedAt = report.respondedAt
        || firstResponderEntry?.respondedAt
        || new Date();

    const publicResponseData = {
        reportId: report._id,
        responder: {
            unitName,
            unitType,
        },
        respondedAt: new Date(),
        totalResponders: report.responders ? report.responders.length : 1,
    };

    // Public events expose the responding agency, never responder identities or
    // the report's internal responder assignments.
    io.emit('multiUnitResponse', publicResponseData);
    io.emit('reportResponded', {
        id: report._id,
        status: 'responding',
        municipalityName: report.municipalityName,
        respondedBy: { agency: unitType },
        respondingAgencies: [...new Set((report.responders || [])
            .map((entry) => entry.unitType)
            .filter(Boolean)
            .concat(unitType))],
        respondedAt: firstRespondedAt,
        totalResponders: publicResponseData.totalResponders,
    });

    // Authenticated municipality rooms may receive the operator identity needed
    // for dispatch coordination.
    if (report.municipalityName) {
        io.to(`municipality_${report.municipalityName}`).emit('localUnitResponse', {
            ...publicResponseData,
            responder: {
                _id: responder._id,
                name: responder.name,
                unitName,
                unitType,
            },
        });
    }

    console.log(`🚑 Multi-unit response broadcasted:`, {
        reportId: report._id,
        unit: `${unitType} - ${unitName}`,
        totalResponders: publicResponseData.totalResponders,
    });
};

/**
 * Broadcast report verification to all clients (existing functionality)
 * @param {Object} io - Socket.IO instance
 * @param {Object} report - The verified report
 */
export const broadcastReportVerified = (io, report) => {
    if (!io) return;

    const evidence = buildReportEvidenceObject(report);

    io.emit('reportVerified', {
        id: report._id,
        incidentCategory: report.incidentCategory,
        incidentType: report.incidentType,
        title: report.title,
        description: report.description,
        address: report.address,
        municipalityName: report.municipalityName,
        coordinates: report.coordinates,
        incidentTime: report.incidentTime,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        barangay: report.barangay,
        severity: report.severity,
        priority: report.priority,
        casualties: report.casualties,
        evidence,
        evidenceCount: evidence.evidenceCount,
    });


    // Notify municipality-specific channel (use municipalityName to match frontend rooms)
    if (report.municipalityName) {
        io.to(`municipality_${report.municipalityName}`).emit('localIncidentVerified', {
            id: report._id,
            incidentCategory: report.incidentCategory,
            address: report.address,
            severity: report.severity,
        });
    }
};

/**
 * Broadcast report rejection notification
 * @param {Object} io - Socket.IO instance
 * @param {String} reporterId - The reporter's user ID
 * @param {String} reportId - The report ID
 * @param {String} reason - Rejection reason
 */
export const broadcastReportRejected = (io, reporterId, reportId, reason) => {
    if (!io) return;

    io.to(`user_${reporterId}`).emit('reportRejected', {
        id: reportId,
        reason,
    });
};

/**
 * Join responder to municipality-specific responder room
 * Called when responder logs in
 * @param {Object} socket - Socket instance
 * @param {String} municipalityId - Municipality ID or name
 */
export const joinResponderRoom = (socket, municipalityId) => {
    const responderRoom = `municipality_${municipalityId}_responders`;
    socket.join(responderRoom);
    console.log(`👮 Responder joined room: ${responderRoom}`);
};

/**
 * Leave responder room
 * @param {Object} socket - Socket instance
 * @param {String} municipalityId - Municipality ID or name
 */
export const leaveResponderRoom = (socket, municipalityId) => {
    const responderRoom = `municipality_${municipalityId}_responders`;
    socket.leave(responderRoom);
    console.log(`👮 Responder left room: ${responderRoom}`);
};

/**
 * Broadcast report transfer notification
 * @param {Object} io - Socket.IO instance
 * @param {Object} report - The transferred report
 * @param {String} fromMuni - Originating municipality name
 * @param {String} toMuni - Target municipality name
 * @param {String} _reason - Private transfer reason; deliberately excluded from public events
 */
export const broadcastReportTransfer = (io, report, fromMuni, toMuni, _reason) => {
    if (!io) return;

    const evidence = buildReportEvidenceObject(report);

    const eventData = {
        id: report._id,
        title: report.title,
        address: report.address,
        description: report.description,
        incidentCategory: report.incidentCategory,
        incidentType: report.incidentType,
        incidentTime: report.incidentTime,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        barangay: report.barangay,
        coordinates: report.coordinates,
        severity: report.severity,
        fromMunicipality: fromMuni,
        toMunicipality: toMuni,
        municipalityName: toMuni,
        status: report.status,
        evidence,
        evidenceCount: evidence.evidenceCount,
    };



    // 1. Emit to general dashboard channel (public update)
    io.emit('reportTransferred', eventData);

    // 2. Alert the target municipality specifically
    io.to(`municipality_${toMuni}`).emit('localIncidentTransferredIn', eventData);
    io.to(`municipality_${toMuni}_responders`).emit('reportVerifiedAlert', {
        ...(typeof report.toObject === 'function' ? report.toObject() : report),
        id: report._id,
        timestamp: new Date()
    });
    io.to(`municipality_${toMuni}_responders`).emit('reportTransferredAlert', eventData);

    // 3. Alert the originating municipality specifically
    io.to(`municipality_${fromMuni}`).emit('localIncidentTransferredOut', eventData);
    io.to(`municipality_${fromMuni}_responders`).emit('reportTransferredAlert', eventData);

    console.log(`🔄 Report ${report._id} transferred from ${fromMuni} to ${toMuni}`);
};

/**
 * Broadcast a public-safe resolution state and send operational details only
 * to the report owner and the currently responsible municipality.
 */
export const broadcastReportResolved = (io, report, responder, agencyLabel) => {
    if (!io) return;

    const publicPayload = {
        id: report._id,
        status: 'resolved',
        municipalityName: report.municipalityName,
        resolvedAt: report.resolvedAt,
        resolvedBy: {
            agency: responder.agency,
            agencyLabel,
        },
    };

    io.emit('reportResolved', publicPayload);

    const privatePayload = {
        ...publicPayload,
        resolvedBy: {
            _id: responder._id,
            name: responder.name,
            agency: responder.agency,
            agencyLabel,
        },
        resolutionNotes: report.resolutionNotes || '',
    };
    const reporterId = report.reporter?._id || report.reporter;

    if (reporterId) {
        io.to(`user_${reporterId}`).emit('reportResolutionDetails', privatePayload);
    }
    if (report.municipalityName) {
        io.to(`municipality_${report.municipalityName}`).emit('reportResolutionDetails', privatePayload);
    }
};

/**
 * Broadcast a non-blocking acknowledgment of the latest municipality transfer.
 * The report lifecycle and responder eligibility remain unchanged.
 */
export const broadcastTransferAcknowledged = (io, report, transfer, municipalAdmin) => {
    if (!io) return;

    const payload = {
        id: report._id,
        status: report.status,
        municipalityName: report.municipalityName,
        transferId: transfer._id,
        acknowledgedAt: transfer.acknowledgedAt,
        acknowledgedBy: {
            _id: municipalAdmin._id,
            name: municipalAdmin.name,
            role: municipalAdmin.role,
            assignedMunicipality: municipalAdmin.assignedMunicipality,
        },
    };

    // Acknowledgment identity and transfer history are operational data. Send
    // them only to the source and target municipality rooms, never globally.
    const rooms = new Set([
        transfer.fromMunicipalityName,
        transfer.toMunicipalityName,
        report.municipalityName,
    ].filter(Boolean).map((municipality) => `municipality_${municipality}`));

    if (rooms.size === 0) return;
    let scopedOperator = io;
    rooms.forEach((room) => {
        scopedOperator = scopedOperator.to(room);
    });
    scopedOperator.emit('reportTransferAcknowledged', payload);
};

export default {
    broadcastVerifiedReportToResponders,
    broadcastMultiUnitResponse,
    broadcastReportVerified,
    broadcastReportRejected,
    broadcastReportResolved,
    broadcastReportTransfer,
    broadcastTransferAcknowledged,
    joinResponderRoom,
    leaveResponderRoom,
};
