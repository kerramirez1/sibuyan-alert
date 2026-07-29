import express from 'express';
import request from 'supertest';
import { validateRegister } from '../middleware/validate.js';

const createApp = () => {
    const app = express();
    app.use(express.json());
    app.post('/register', validateRegister, (req, res) => res.sendStatus(204));
    return app;
};

const validRegistration = {
    email: 'reporter@example.com',
    password: 'a-long-test-password',
    name: 'Test Reporter',
    municipality: 'Cajidiocan',
    barangay: 'Gutivan',
};

describe('reporter location validation', () => {
    test('allows an official municipality and barangay pair', async () => {
        await request(createApp())
            .post('/register')
            .send(validRegistration)
            .expect(204);
    });

    test('rejects stale barangay names from the previous frontend list', async () => {
        const response = await request(createApp())
            .post('/register')
            .send({ ...validRegistration, barangay: 'Danao Norte' })
            .expect(400);

        expect(response.body.errors).toContainEqual({
            field: 'barangay',
            message: 'Barangay does not belong to the selected municipality',
        });
    });

    test('rejects a valid barangay paired with the wrong municipality', async () => {
        await request(createApp())
            .post('/register')
            .send({ ...validRegistration, municipality: 'Magdiwang' })
            .expect(400);
    });
});
