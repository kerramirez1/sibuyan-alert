import { describe, expect, test, vi as jest } from 'vitest';
import {
    broadcastMultiUnitResponse,
    broadcastReportVerified,
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

    test('keeps the first response timestamp and responder when another unit joins', () => {
        const io = createIo();
        const firstRespondedAt = new Date('2026-07-17T10:05:00Z');
        const report = {
            _id: 'report1',
            municipalityName: 'Magdiwang',
            respondedBy: 'responder1',
            respondedAt: firstRespondedAt,
            responders: [
                { user: 'responder1', respondedAt: firstRespondedAt },
                { user: 'responder2', respondedAt: new Date('2026-07-17T10:20:00Z') },
            ],
        };

        broadcastMultiUnitResponse(
            io,
            report,
            { _id: 'responder2', name: 'Joining Unit', agency: 'PNP' },
            'PNP - Magdiwang',
            'PNP'
        );

        const payload = io.emit.mock.calls.find(([event]) => event === 'reportResponded')[1];
        expect(payload.respondedAt).toBe(firstRespondedAt);
        expect(payload.respondedBy).toEqual({ _id: 'responder1' });
    });

    test('includes canonical analytics fields in verified report events', () => {
        const io = createIo();
        const createdAt = new Date('2026-07-17T09:00:00Z');
        const report = {
            _id: 'report1',
            createdAt,
            updatedAt: new Date('2026-07-17T09:10:00Z'),
            incidentTime: new Date('2026-07-16T22:00:00Z'),
            municipalityName: 'Cajidiocan',
            barangay: 'Poblacion',
        };

        broadcastReportVerified(io, report);

        expect(io.emit).toHaveBeenCalledWith('reportVerified', expect.objectContaining({
            id: 'report1',
            createdAt,
            barangay: 'Poblacion',
        }));
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
            createdAt: new Date('2026-07-17T10:05:00Z'),
            barangay: 'Boundary',
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
                createdAt: report.createdAt,
                barangay: 'Boundary',
            })
        );
        const publicPayload = io.emit.mock.calls.find(([event]) => event === 'reportTransferred')[1];
        expect(publicPayload).not.toHaveProperty('reason');
        expect(publicPayload).not.toHaveProperty('transferReason');
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
