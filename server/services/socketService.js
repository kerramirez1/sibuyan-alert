/**
 * Socket.IO Service for Alert Broadcasting
 * Centralized service for managing real-time notifications and alerts
 */

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
    const firstResponderId = report.respondedBy?._id
        || report.respondedBy
        || firstResponderEntry?.user?._id
        || firstResponderEntry?.user
        || responder._id;
    const isCurrentResponderFirst = firstResponderId?.toString() === responder._id?.toString();
    const firstRespondedAt = report.respondedAt
        || firstResponderEntry?.respondedAt
        || new Date();

    const responseData = {
        reportId: report._id,
        responder: {
            _id: responder._id,
            name: responder.name,
            unitName,
            unitType,
        },
        respondedAt: new Date(),
        totalResponders: report.responders ? report.responders.length : 1,
    };

    // Broadcast to all clients (public update)
    io.emit('multiUnitResponse', responseData);
    io.emit('reportResponded', {
        id: report._id,
        status: 'responding',
        municipalityName: report.municipalityName,
        respondedBy: isCurrentResponderFirst
            ? {
                _id: responder._id,
                name: responder.name,
                agency: responder.agency,
                unitName,
                unitType,
            }
            : { _id: firstResponderId },
        respondedAt: firstRespondedAt,
        responders: report.responders || [],
    });

    // Also broadcast to municipality-specific room (use municipalityName to match frontend rooms)
    if (report.municipalityName) {
        io.to(`municipality_${report.municipalityName}`).emit('localUnitResponse', responseData);
    }

    console.log(`🚑 Multi-unit response broadcasted:`, {
        reportId: report._id,
        unit: `${unitType} - ${unitName}`,
        totalResponders: responseData.totalResponders,
    });
};

/**
 * Broadcast report verification to all clients (existing functionality)
 * @param {Object} io - Socket.IO instance
 * @param {Object} report - The verified report
 */
export const broadcastReportVerified = (io, report) => {
    if (!io) return;

    io.emit('reportVerified', {
        id: report._id,
        incidentCategory: report.incidentCategory,
        incidentType: report.incidentType,
        title: report.title,
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
 * @param {String} reason - Reason for transfer
 */
export const broadcastReportTransfer = (io, report, fromMuni, toMuni, reason) => {
    if (!io) return;

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
    };

    // 1. Emit to general dashboard channel (public update)
    io.emit('reportTransferred', eventData);

    // 2. Alert the target municipality specifically
    io.to(`municipality_${toMuni}`).emit('localIncidentTransferredIn', eventData);
    io.to(`municipality_${toMuni}_responders`).emit('reportVerifiedAlert', {
        ...report.toObject(),
        id: report._id,
        timestamp: new Date()
    });

    // 3. Alert the originating municipality specifically
    io.to(`municipality_${fromMuni}`).emit('localIncidentTransferredOut', eventData);

    console.log(`🔄 Report ${report._id} transferred from ${fromMuni} to ${toMuni}`);
};

/**
 * Broadcast a non-blocking acknowledgment of the latest municipality transfer.
 * The report lifecycle and responder eligibility remain unchanged.
 */
export const broadcastTransferAcknowledged = (io, report, transfer, municipalAdmin) => {
    if (!io) return;

    io.emit('reportTransferAcknowledged', {
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
    });
};

export default {
    broadcastVerifiedReportToResponders,
    broadcastMultiUnitResponse,
    broadcastReportVerified,
    broadcastReportRejected,
    broadcastReportTransfer,
    broadcastTransferAcknowledged,
    joinResponderRoom,
    leaveResponderRoom,
};
