export const PASSWORD_MIN_CHARACTERS = 12;
export const PASSWORD_MAX_UTF8_BYTES = 72;
export const PASSWORD_POLICY_MESSAGE = 'Password must contain at least 12 characters and no more than 72 UTF-8 bytes';

export const isPasswordPolicyCompliant = (password) => (
    typeof password === 'string'
    && password.length >= PASSWORD_MIN_CHARACTERS
    && Buffer.byteLength(password, 'utf8') <= PASSWORD_MAX_UTF8_BYTES
);

