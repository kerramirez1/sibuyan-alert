import { describe, expect, test, jest } from '@jest/globals';
import {
    broadcastMultiUnitResponse,
    broadcastReportTransfer,
    broadcastTransferAcknowledged,
} from '../services/socketService.js';

const createIo = () => {
    const roomEmit = jest.fn();
    const roomOperator = {
        emit: roomEmit,
        to: jest.fn(() => roomOperator),
    };

    return {
        emit: jest.fn(),
        to: jest.fn(() => roomOperator),
        roomEmit,
    };
};

describe('socket report lifecycle events', () => {
    test('emits the canonical reportResponded event used by marker clients', () => {
        const io = createIo();
        const report = {
            _id: 'report1',
            municipalityName: 'Magdiwang',
            responders: [{ user: 'responder1' }],
        };
        const responder = {
            _id: 'responder1',
            name: 'BFP Responder',
            agency: 'BFP',
        };

        broadcastMultiUnitResponse(io, report, responder, 'BFP - Magdiwang', 'BFP');

        expect(io.emit).toHaveBeenCalledWith(
            'reportResponded',
            expect.objectContaining({
                id: 'report1',
                status: 'responding',
                municipalityName: 'Magdiwang',
                respondedBy: expect.objectContaining({ _id: 'responder1', agency: 'BFP' }),
            })
        );
    });

    test('broadcasts a public-safe transferred marker payload', () => {
        const io = createIo();
        const report = {
            _id: 'report1',
            title: 'Road incident',
            address: 'Boundary Road',
            description: 'Vehicle collision',
            incidentCategory: 'accident',
            incidentType: 'vehicular',
            incidentTime: new Date('2026-07-17T10:00:00Z'),
            coordinates: { lat: 12.4, lng: 122.5 },
            severity: 'moderate',
            status: 'transferred',
            toObject: jest.fn(() => ({ _id: 'report1', status: 'transferred' })),
        };

        broadcastReportTransfer(io, report, 'Cajidiocan', 'Magdiwang', 'Internal transfer reason');

        expect(io.emit).toHaveBeenCalledWith(
            'reportTransferred',
            expect.objectContaining({
                id: 'report1',
                municipalityName: 'Magdiwang',
                status: 'transferred',
                coordinates: { lat: 12.4, lng: 122.5 },
            })
        );
        const publicPayload = io.emit.mock.calls.find(([event]) => event === 'reportTransferred')[1];
        expect(publicPayload).not.toHaveProperty('reason');
    });

    test('broadcasts transfer acknowledgment without changing lifecycle status', () => {
        const io = createIo();
        const report = {
            _id: 'report1',
            status: 'responding',
            municipalityName: 'Cajidiocan',
        };
        const transfer = {
            _id: 'transfer1',
            acknowledgedAt: new Date('2026-07-17T10:15:00Z'),
        };
        const municipalAdmin = {
            _id: 'admin1',
            name: 'Cajidiocan Admin',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        };

        broadcastTransferAcknowledged(io, report, transfer, municipalAdmin);

        expect(io.emit).toHaveBeenCalledWith('reportTransferAcknowledged', {
            id: 'report1',
            status: 'responding',
            municipalityName: 'Cajidiocan',
            transferId: 'transfer1',
            acknowledgedAt: transfer.acknowledgedAt,
            acknowledgedBy: municipalAdmin,
        });
    });
});
