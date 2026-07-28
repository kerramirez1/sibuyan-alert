/**
 * Seed account config loader.
 *
 * Expected environment variables (JSON arrays):
 * - SEED_MUNICIPAL_ADMINS_JSON
 * - SEED_RESPONDER_ACCOUNTS_JSON
 *
 * Optional:
 * - SEED_LEGACY_EMAILS_JSON (JSON array of emails to clean up)
 */

const parseJsonEnv = (name, fallback = null) => {
    const raw = process.env[name];
    if (!raw) return fallback;

    try {
        return JSON.parse(raw);
    } catch {
        throw new Error(`${name} must be valid JSON`);
    }
};

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const normalizeBaseUser = (item) => ({
    email: item.email?.toLowerCase()?.trim(),
    password: item.password,
    name: item.name?.trim(),
    role: item.role,
    assignedMunicipality: item.assignedMunicipality || null,
    agency: item.agency || null,
    responderUnit: item.responderUnit || null,
    isVerified: item.isVerified ?? true,
    verificationStatus: item.verificationStatus || 'not_required',
});

const validateRequired = (item, fields, label) => {
    for (const field of fields) {
        if (!isNonEmptyString(item[field])) {
            throw new Error(`${label} is missing required field: ${field}`);
        }
    }
};

export const getMunicipalAdminsConfig = () => {
    const data = parseJsonEnv('SEED_MUNICIPAL_ADMINS_JSON', []);
    if (!Array.isArray(data)) {
        throw new Error('SEED_MUNICIPAL_ADMINS_JSON must be a JSON array');
    }

    return data.map((item, index) => {
        validateRequired(item, ['email', 'password', 'name', 'assignedMunicipality'], `Municipal admin #${index + 1}`);
        return normalizeBaseUser({ ...item, role: 'municipal_admin' });
    });
};

export const getResponderAccountsConfig = () => {
    // Account creation must be explicitly configured. Never fall back to
    // repository-known credentials in a running environment.
    const data = parseJsonEnv('SEED_RESPONDER_ACCOUNTS_JSON', []);
    if (!Array.isArray(data)) {
        throw new Error('SEED_RESPONDER_ACCOUNTS_JSON must be a JSON array');
    }

    return data.map((item, index) => {
        validateRequired(
            item,
            ['email', 'password', 'name', 'assignedMunicipality', 'agency', 'responderUnit'],
            `Responder account #${index + 1}`
        );
        return normalizeBaseUser({ ...item, role: 'responder' });
    });
};

export const getLegacyEmailsToCleanup = () => {
    const data = parseJsonEnv('SEED_LEGACY_EMAILS_JSON', []);
    if (!Array.isArray(data)) {
        throw new Error('SEED_LEGACY_EMAILS_JSON must be a JSON array');
    }

    return data
        .filter((email) => isNonEmptyString(email))
        .map((email) => email.toLowerCase().trim());
};
