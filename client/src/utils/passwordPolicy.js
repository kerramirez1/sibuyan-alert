export const PASSWORD_MIN_CHARACTERS = 12;
export const PASSWORD_MAX_CHARACTERS = 72;
export const PASSWORD_POLICY_MESSAGE = 'Use at least 12 characters and no more than 72 UTF-8 bytes.';

export const isPasswordPolicyCompliant = (password) => (
    typeof password === 'string'
    && password.length >= PASSWORD_MIN_CHARACTERS
    && new TextEncoder().encode(password).length <= PASSWORD_MAX_CHARACTERS
);

