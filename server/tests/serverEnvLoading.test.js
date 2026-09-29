import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * The server's .env load must not depend on the working directory.
 *
 * A bare `dotenv.config()` resolves `./.env` against `process.cwd()`. Starting the
 * server as `node server/server.js` from the repository root therefore found no
 * file, left every variable undefined, and the email path degraded silently:
 * `isEmailConfigured()` returned false and BOTH the password reset and the
 * responder invitation reported "not configured" without attempting a send.
 * Starting it as `npm run dev` from server/ worked — which is what made the
 * failure look intermittent, and why a host that injects real config (Heroku)
 * never saw it at all.
 *
 * Asserted against the source because the failure is a property of how the file
 * is loaded, and no unit test can reproduce a different process.cwd().
 */
const SERVER_ENTRY = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'server.js');

describe('server .env loading', () => {
    const raw = readFileSync(SERVER_ENTRY, 'utf8');
    // Comments are stripped first: this file's own explanatory prose quotes the
    // bare `dotenv.config()` form, and the guard is about executable code.
    const source = raw
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('//'))
        .join('\n');

    test('never calls dotenv.config() without a path', () => {
        // `dotenv.config()` and `dotenv.config({})` both fall back to cwd.
        expect(source).not.toMatch(/dotenv\.config\(\s*\)/);
        expect(source).not.toMatch(/dotenv\.config\(\s*\{\s*\}\s*\)/);
    });

    test('anchors the path to the module rather than the working directory', () => {
        expect(source).toMatch(/dotenv\.config\(\{\s*path:/);
        expect(source).toMatch(/fileURLToPath\(import\.meta\.url\)/);
    });

    test('the anchored expression resolves to server/.env', () => {
        // The same expression server.js evaluates, standing in for that module.
        const envPath = resolve(dirname(fileURLToPath(pathToFileURL(SERVER_ENTRY))), '.env');

        expect(envPath).toBe(resolve(dirname(SERVER_ENTRY), '.env'));
        expect(dirname(envPath)).toBe(dirname(SERVER_ENTRY));
    });
});
