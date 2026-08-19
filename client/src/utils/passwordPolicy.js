export const PASSWORD_MIN_CHARACTERS = 8;
export const PASSWORD_MAX_CHARACTERS = 72;
export const PASSWORD_POLICY_MESSAGE = `Use at least ${PASSWORD_MIN_CHARACTERS} characters and no more than ${PASSWORD_MAX_CHARACTERS} UTF-8 bytes.`;

export const isPasswordPolicyCompliant = (password) => (
    typeof password === 'string'
    && password.length >= PASSWORD_MIN_CHARACTERS
    && new TextEncoder().encode(password).length <= PASSWORD_MAX_CHARACTERS
);

