import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../models/Report.js', () => ({
    default: { findById: vi.fn() },
}));

vi.mock('../models/User.js', () => ({
    default: { find: vi.fn() },
}));

vi.mock('../models/Municipality.js', () => ({ default: {} }));

vi.mock('../models/Notification.js', () => ({
    default: { createAndSend: vi.fn() },
}));

vi.mock('../services/geocoding.js', () => ({
    isWithinSibuyanBounds: vi.fn(),
}));

vi.mock('../services/locationService.js', () => ({
    processLocation: vi.fn(),
    getResponseTimeEstimate: vi.fn(),
}));

vi.mock('../utils/locationPolicy.js', () => ({ parseLocationCapture: vi.fn() }));
vi.mock('../services/emailService.js', () => ({ sendNewReportAlertEmail: vi.fn() }));
vi.mock('../services/pushService.js', () => ({ sendPushToUsers: vi.fn(), pushTemplates: {} }));
vi.mock('../services/gridFsService.js', () => ({
    deleteGridFsFilesByUrls: vi.fn(),
    uploadFilesToGridFS: vi.fn(),
}));

const { addReportUpdate } = await import('../controllers/reportController.js');
const { default: Report } = await import('../models/Report.js');
const { default: User } = await import('../models/User.js');
const { default: Notification } = await import('../models/Notification.js');

const createResponse = () => {
    const response = {};
    response.status = vi.fn(() => response);
    response.json = vi.fn(() => response);
    return response;
};

describe('report situation update notifications', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('persists structured, actionable notification context without changing lifecycle', async () => {
        const reporterId = '64b100000000000000000001';
        const recipientId = '64b100000000000000000002';
        const reportId = '64b100000000000000000003';
        const updateId = '64b100000000000000000004';
        const updateCreatedAt = new Date('2026-07-17T08:20:00.000Z');
        const reportUpdates = [];
        reportUpdates.push = vi.fn((update) => Array.prototype.push.call(reportUpdates, {
            ...update,
            _id: updateId,
            createdAt: updateCreatedAt,
        }));
        const report = {
            _id: reportId,
            address: 'Poblacion coastal road',
            municipalityName: 'Cajidiocan',
            status: 'verified',
            reporter: { _id: reporterId },
            reportUpdates,
            save: vi.fn().mockResolvedValue(undefined),
            populate: vi.fn().mockResolvedValue(undefined),
        };
        Report.findById.mockReturnValue({
            populate: vi.fn().mockResolvedValue(report),
        });
        User.find.mockReturnValue({
            select: vi.fn().mockResolvedValue([{ _id: recipientId }]),
        });
        Notification.createAndSend.mockResolvedValue({});
        const emit = vi.fn();
        const io = { to: vi.fn(() => ({ emit })) };
        const request = {
            params: { id: reportId },
            body: {
                tag: 'need_help',
                message: 'The patient needs another medical response unit.',
            },
            user: { _id: reporterId, role: 'reporter', name: 'Field Reporter' },
            app: { get: vi.fn(() => io) },
        };
        const response = createResponse();

        await addReportUpdate(request, response);

        expect(report.status).toBe('verified');
        expect(report.save).toHaveBeenCalledTimes(1);
        expect(Notification.createAndSend).toHaveBeenCalledWith(expect.objectContaining({
            recipient: recipientId,
            type: 'report_update',
            title: 'Urgent help requested',
            message: 'Field Reporter: The patient needs another medical response unit.',
            data: expect.objectContaining({
                reportId,
                updateId,
                tag: 'need_help',
                municipality: 'Cajidiocan',
                reporterName: 'Field Reporter',
                address: 'Poblacion coastal road',
                reportStatus: 'verified',
                updateCreatedAt,
            }),
        }), io);
        expect(response.status).toHaveBeenCalledWith(201);
    });
});
