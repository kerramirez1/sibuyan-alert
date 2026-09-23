import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import * as sessions from '../services/authSessionService.js';
import * as storage from '../services/gridFsService.js';
import * as faces from '../services/faceDetectionService.js';
import { ACCESS_COOKIE_NAME } from '../config/authConfig.js';
import authRoutes from '../routes/auth.js';
import adminRoutes from '../routes/admin.js';
import reportRoutes from '../routes/reports.js';

const mocks = vi.hoisted(() => ({ createReport: vi.fn((req, res) => res.status(201).json({ success: true })) }));
vi.mock('../controllers/reportController.js', async (importOriginal) => ({
    ...await importOriginal(),
    createReport: mocks.createReport,
}));

const USER_ID = '507f1f77bcf86cd799439011';
const ADMIN_ID = '507f1f77bcf86cd799439012';
const FEEDBACK = 'Please send a readable photo showing all four ID corners.';
const image = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#668899' } }).png().toBuffer();
const cookie = (token = 'reporter-session') => `${ACCESS_COOKIE_NAME}=${token}`;
const query = (value) => {
    const result = Promise.resolve(value);
    result.select = vi.fn(() => result);
    result.populate = vi.fn(() => result);
    return result;
};

let account;
const administrator = { _id: ADMIN_ID, role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' };
const createApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/reports', reportRoutes);
    return app;
};
const app = createApp();

const setVerification = (status) => {
    account.verificationStatus = status;
    account.isVerified = status === 'approved';
    account.verificationFeedback = status === 'rejected' ? FEEDBACK : null;
};

const expectAccountState = (payload, status) => {
    expect(payload).toMatchObject({
        role: 'reporter', isVerified: status === 'approved', verificationStatus: status,
        verificationFeedback: status === 'rejected' ? FEEDBACK : null,
    });
    for (const key of ['idDocument', 'selfiePhoto', 'verifiedBy', 'verifiedAt', 'verificationHistory', 'password']) {
        expect(payload).not.toHaveProperty(key);
    }
};

beforeEach(() => {
    vi.clearAllMocks();
    account = {
        _id: USER_ID, name: 'Juan Reporter', email: 'juan@example.com', password: 'stored-password-hash',
        role: 'reporter', assignedMunicipality: 'Cajidiocan', isVerified: false, verificationStatus: 'pending', verificationFeedback: null,
        verifiedBy: ADMIN_ID, verifiedAt: new Date('2026-09-01'), verificationHistory: [{ action: 'id_submitted' }],
        idDocument: '/api/files/private-id/id.png', selfiePhoto: '/api/files/private-selfie/selfie.png',
        avatar: '/api/files/old-avatar/avatar.png', notificationPreferences: { email: false, browserPush: false },
        save: vi.fn(async () => account), comparePassword: vi.fn(async () => true), recordVerificationEvent: vi.fn(),
    };
    vi.spyOn(User, 'findById').mockImplementation((id) => query(String(id) === USER_ID ? account : null));
    vi.spyOn(User, 'findOne').mockImplementation(({ email }) => query(email === account.email ? account : null));
    // Real route guards resolve the cookie to a server-owned account, never req.body.
    vi.spyOn(sessions, 'resolveAccessIdentity').mockImplementation(async (token) => {
        if (token === 'reporter-session') return { user: account, session: {} };
        if (token === 'admin-session') return { user: administrator, session: {} };
        if (token === 'other-municipality') return { user: { ...administrator, assignedMunicipality: 'Magdiwang' }, session: {} };
        return null;
    });
    vi.spyOn(sessions, 'issueSession').mockResolvedValue();
    vi.spyOn(sessions, 'revokeRequestSession').mockResolvedValue();
    vi.spyOn(sessions, 'revokeAllUserSessions').mockResolvedValue();
    vi.spyOn(storage, 'uploadFileToGridFS').mockImplementation(async (file, metadata) => ({ url: `/api/files/new-${metadata.category}/${file.originalname}` }));
    vi.spyOn(storage, 'deleteGridFsFileByUrl').mockResolvedValue();
    vi.spyOn(storage, 'deleteGridFsFilesByUrls').mockResolvedValue();
    vi.spyOn(Notification, 'createAndSend').mockResolvedValue({});
    vi.spyOn(faces, 'detectFaces').mockResolvedValue({ status: 'faces_detected', faces: [{ x: 10, y: 10, width: 100, height: 100 }] });
});

describe('self-account verification payloads', () => {
    test.each(['pending', 'approved', 'rejected'])('GET /auth/me retains complete %s verification state', async (status) => {
        setVerification(status);
        const response = await request(app).get(`/api/auth/me?id=${ADMIN_ID}`).set('Cookie', cookie());
        expect(response.status).toBe(200);
        expect(response.body.data.id).toBe(USER_ID);
        expectAccountState(response.body.data, status);
    });

    test.each(['pending', 'approved', 'rejected'])('login returns the same %s state as the profile endpoint', async (status) => {
        setVerification(status);
        const response = await request(app).post('/api/auth/login').send({ email: account.email, password: 'CurrentPassword123' });
        expect(response.status).toBe(200);
        expectAccountState(response.body.data.user, status);
    });

    test.each(['pending', 'approved', 'rejected'])('profile edits cannot overwrite protected %s approval fields', async (status) => {
        setVerification(status);
        const before = { role: account.role, isVerified: account.isVerified, verificationStatus: account.verificationStatus, verificationFeedback: account.verificationFeedback, verifiedBy: account.verifiedBy, verifiedAt: account.verifiedAt, verificationHistory: account.verificationHistory };
        const forged = { role: 'municipal_admin', isVerified: !account.isVerified, verificationStatus: status === 'approved' ? 'rejected' : 'approved', verificationFeedback: 'Forged approval', verifiedBy: USER_ID, verifiedAt: new Date().toISOString(), verificationHistory: [] };
        const response = await request(app).put('/api/auth/me').set('Cookie', cookie()).send({ name: 'Updated name', ...forged, $set: forged });
        expect(response.status).toBe(200);
        expect(account.name).toBe('Updated name');
        expect(account).toMatchObject(before);
        expectAccountState(response.body.data, status);
    });

    test.each(['email', 'password', 'avatar'])('%s updates preserve reporter identity and verification in their response', async (change) => {
        setVerification('approved');
        const pending = request(app).put('/api/auth/me').set('Cookie', cookie());
        const response = change === 'avatar'
            ? await pending.attach('avatar', image, { filename: 'avatar.png', contentType: 'image/png' })
            : await pending.send({ currentPassword: 'CurrentPassword123', ...(change === 'email' ? { email: 'updated@example.com' } : { newPassword: 'UpdatedPassword123' }) });
        expect(response.status).toBe(200);
        expectAccountState(response.body.data, 'approved');
        if (change === 'avatar') expect(response.body.data.avatar).toContain('new-avatar');
        if (change === 'email') expect(response.body.data.email).toBe('updated@example.com');
        if (change === 'password') expect(account.password).toBe('UpdatedPassword123');
    });

    test('untrusted self-profile requests cannot retrieve private verification information', async () => {
        setVerification('rejected');
        const response = await request(app).get('/api/auth/me').set('Cookie', cookie('forged-session'));
        expect(response.status).toBe(401);
        expect(JSON.stringify(response.body)).not.toContain(FEEDBACK);
        expect(JSON.stringify(response.body)).not.toContain('private-id');
    });
});

describe('municipal verification and resubmission', () => {
    test.each(['approved', 'rejected'])('administrator %s transition retains the reporter role', async (status) => {
        const response = await request(app).put(`/api/admin/users/${USER_ID}/verify`).set('Cookie', cookie('admin-session'))
            .send({ status, ...(status === 'rejected' ? { feedback: FEEDBACK } : {}) });
        expect(response.status).toBe(200);
        expectAccountState(response.body.data, status);
        expect(account.role).toBe('reporter');
        expect(account.isVerified).toBe(status === 'approved');
        expect(account.verificationStatus).toBe(status);
        expect(account.save).toHaveBeenCalledOnce();
        expect(account.recordVerificationEvent).toHaveBeenCalledWith(expect.objectContaining({ action: status, actor: ADMIN_ID }));
    });

    test('another municipality cannot approve or inspect the reporter', async () => {
        setVerification('rejected');
        for (const method of ['get', 'put']) {
            const endpoint = `/api/admin/users/${USER_ID}${method === 'put' ? '/verify' : ''}`;
            const response = await request(app)[method](endpoint).set('Cookie', cookie('other-municipality')).send(method === 'put' ? { status: 'approved' } : undefined);
            expect(response.status).toBe(403);
            expect(JSON.stringify(response.body)).not.toContain(FEEDBACK);
            expect(JSON.stringify(response.body)).not.toContain('private-id');
        }
        expect(account.isVerified).toBe(false);
        expect(account.save).not.toHaveBeenCalled();
    });

    test('a reporter cannot approve their own account via the administrator endpoint', async () => {
        const response = await request(app).put(`/api/admin/users/${USER_ID}/verify`).set('Cookie', cookie()).send({ status: 'approved' });
        expect(response.status).toBe(403);
        expect(account.save).not.toHaveBeenCalled();
    });

    test('resubmission clears rejection feedback, restores pending state and retains the existing selfie', async () => {
        setVerification('rejected');
        const response = await request(app).post('/api/auth/resubmit-id').set('Cookie', cookie())
            .field('role', 'ordinary').field('isVerified', 'true').field('verificationStatus', 'approved')
            .attach('idDocument', image, { filename: 'replacement-id.png', contentType: 'image/png' });
        expect(response.status).toBe(200);
        expectAccountState(response.body.data, 'pending');
        expect(account.role).toBe('reporter');
        expect(account.isVerified).toBe(false);
        expect(account.selfiePhoto).toBe('/api/files/private-selfie/selfie.png');
        expect(account.verificationFeedback).toBeNull();
    });

    test('approved reporters cannot resubmit identity documents', async () => {
        setVerification('approved');
        const response = await request(app).post('/api/auth/resubmit-id').set('Cookie', cookie())
            .attach('idDocument', image, { filename: 'id.png', contentType: 'image/png' });
        expect(response.status).toBe(400);
        expect(account.save).not.toHaveBeenCalled();
        expect(storage.uploadFileToGridFS).not.toHaveBeenCalled();
    });
});

describe('report submission trusts server identity, not client claims', () => {
    const incident = { address: 'Poblacion coastal road', incidentCategory: 'accident', incidentType: 'vehicular', incidentTime: '2026-09-01T08:00:00.000Z', lat: 12.4, lng: 122.6, severity: 'moderate' };

    test.each(['pending', 'rejected'])('%s reporters cannot bypass the real submission route with forged UI fields', async (status) => {
        setVerification(status);
        const response = await request(app).post('/api/reports').set('Cookie', cookie())
            .send({ ...incident, role: 'reporter', isVerified: true, verificationStatus: 'approved', user: { role: 'reporter', isVerified: true } });
        expect(response.status).toBe(403);
        expect(mocks.createReport).not.toHaveBeenCalled();
    });

    test('approved reporters reach the report creation handler', async () => {
        setVerification('approved');
        const response = await request(app).post('/api/reports').set('Cookie', cookie()).send(incident);
        expect(response.status).toBe(201);
        expect(mocks.createReport).toHaveBeenCalledOnce();
    });

    test.each(['ordinary', 'responder', 'municipal_admin'])('%s identity cannot submit reports even with isVerified=true', async (role) => {
        account.role = role;
        account.isVerified = true;
        const response = await request(app).post('/api/reports').set('Cookie', cookie()).send({ ...incident, role: 'reporter' });
        expect(response.status).toBe(403);
        expect(mocks.createReport).not.toHaveBeenCalled();
    });
});
