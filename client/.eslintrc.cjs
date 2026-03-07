module.exports = {
    root: true,
    env: {
        browser: true,
        es2022: true,
        node: true,
    },
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
            jsx: true,
        },
    },
    settings: {
        react: {
            version: 'detect',
        },
    },
    extends: [
        'eslint:recommended',
        'plugin:react/recommended',
    ],
    plugins: ['react'],
    ignorePatterns: ['dist/', 'node_modules/'],
    rules: {
        'react/react-in-jsx-scope': 'off',
        'react/no-unescaped-entities': 'off',
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        'react/prop-types': 'off',
    },
    overrides: [
        {
            files: ['public/sw.js'],
            env: {
                serviceworker: true,
            },
            globals: {
                clients: 'readonly',
            },
        },
    ],
};
