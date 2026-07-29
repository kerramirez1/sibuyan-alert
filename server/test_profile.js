import dotenv from 'dotenv';

dotenv.config();

const cookies = new Map();

const captureCookies = (response) => {
    const setCookieHeaders = response.headers.getSetCookie?.() || [];
    setCookieHeaders.forEach((header) => {
        const [pair] = header.split(';');
        const separator = pair.indexOf('=');
        if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    });
};

const authenticatedFetch = async (url, options = {}) => {
    const headers = new Headers(options.headers || {});
    if (cookies.size > 0) {
        headers.set('Cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    }
    const csrfToken = cookies.get('sibuyan_csrf');
    if (csrfToken && !['GET', 'HEAD'].includes(options.method || 'GET')) {
        headers.set('X-CSRF-Token', decodeURIComponent(csrfToken));
    }
    const response = await fetch(url, { ...options, headers });
    captureCookies(response);
    return response;
};

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
        const loginResponse = await authenticatedFetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: currentPassword }),
        });

        const loginData = await loginResponse.json();
        if (!loginData.success) {
            console.error('Login failed:', loginData.message);
            return;
        }

        console.log('Login successful:', loginData.data.user.email);

        console.log('Test 1: Updating name...');
        const updateResponse1 = await authenticatedFetch('http://localhost:5000/api/auth/me', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
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
        const updateResponse2 = await authenticatedFetch('http://localhost:5000/api/auth/me', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
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
        const loginResponse2 = await authenticatedFetch('http://localhost:5000/api/auth/login', {
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
        const resetResponse = await authenticatedFetch('http://localhost:5000/api/auth/me', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
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
