export const PASSWORD_MIN_CHARACTERS = 8;
export const PASSWORD_MAX_UTF8_BYTES = 72;
export const PASSWORD_POLICY_MESSAGE = `Password must contain at least ${PASSWORD_MIN_CHARACTERS} characters and no more than ${PASSWORD_MAX_UTF8_BYTES} UTF-8 bytes`;

export const isPasswordPolicyCompliant = (password) => (
    typeof password === 'string'
    && password.length >= PASSWORD_MIN_CHARACTERS
    && Buffer.byteLength(password, 'utf8') <= PASSWORD_MAX_UTF8_BYTES
);

