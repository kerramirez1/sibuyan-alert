import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const testProfileUpdate = async () => {
    try {
        const email = process.env.TEST_PROFILE_EMAIL;
        const currentPassword = process.env.TEST_PROFILE_PASSWORD;
        const newPassword = process.env.TEST_PROFILE_NEW_PASSWORD || 'TempPasswordChange123!';

        if (!email || !currentPassword) {
            console.error('Missing TEST_PROFILE_EMAIL or TEST_PROFILE_PASSWORD in environment.');
            return;
        }

        console.log('Logging in...');
        const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: currentPassword }),
        });

        const loginData = await loginResponse.json();
        if (!loginData.success) {
            console.error('Login failed:', loginData.message);
            return;
        }

        const token = loginData.data.token;
        console.log('Login successful:', loginData.data.user.email);

        console.log('Test 1: Updating name...');
        const updateResponse1 = await fetch('http://localhost:5000/api/auth/me', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                name: `${loginData.data.user.name} (Updated)`,
            }),
        });

        const updateData1 = await updateResponse1.json();
        if (!updateData1.success) {
            console.error('Name update failed:', updateData1.message);
            return;
        }
        console.log('Name updated:', updateData1.data.name);

        console.log('Test 2: Updating password...');
        const updateResponse2 = await fetch('http://localhost:5000/api/auth/me', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                currentPassword,
                newPassword,
            }),
        });

        const updateData2 = await updateResponse2.json();
        if (!updateData2.success) {
            console.error('Password update failed:', updateData2.message);
            return;
        }
        console.log('Password updated.');

        console.log('Verifying new password...');
        const loginResponse2 = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: newPassword }),
        });

        const loginData2 = await loginResponse2.json();
        if (!loginData2.success) {
            console.error('New password verification failed:', loginData2.message);
            return;
        }
        console.log('New password verified.');

        console.log('Resetting password back...');
        const resetResponse = await fetch('http://localhost:5000/api/auth/me', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                currentPassword: newPassword,
                newPassword: currentPassword,
            }),
        });

        const resetData = await resetResponse.json();
        if (!resetData.success) {
            console.error('Password reset back failed:', resetData.message);
            return;
        }

        console.log('Password reset complete.');
        console.log('All tests completed.');
    } catch (error) {
        console.error('Test error:', error);
    }
};

testProfileUpdate();

