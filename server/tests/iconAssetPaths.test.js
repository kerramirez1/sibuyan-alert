import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(here, '..');
const PUBLIC_ROOT = resolve(here, '../../client/public');

/**
 * Guard rail for a real defect found on 2026-09-12.
 *
 * Two push payloads in `adminController.js` set `icon: '/icon-192x192.png'`.
 * That file has never existed — the shipped asset is `/icons/icon-192.png`.
 * Because `pushService.js` only applies its default when `payload.icon` is
 * falsy, the bad path won every time: those notifications rendered without the
 * app icon, and nothing failed loudly. A 404 in an image field is silent.
 *
 * This test resolves every root-relative image path the server hands to a
 * client and asserts the file is actually on disk.
 */
const walk = (dir, out = []) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'coverage') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (entry.name.endsWith('.js')) out.push(full);
    }
    return out;
};

// A quoted root-relative path ending in an image extension. The leading quote
// is required so absolute URLs (https://…) can never match.
const ASSET_PATH = /['"](\/[A-Za-z0-9._/-]+\.(?:png|jpe?g|svg|webp|ico|gif))['"]/g;

describe('server-referenced client assets exist', () => {
    const files = walk(SERVER_ROOT).filter((file) => !file.includes(`${join('server', 'tests')}`));

    test('scans the server source', () => {
        // Sanity check: a broken walk would make the assertions below vacuous.
        expect(files.length).toBeGreaterThan(20);
    });

    test('every root-relative image path resolves to a file in client/public', () => {
        const missing = [];

        for (const file of files) {
            const source = readFileSync(file, 'utf8');
            for (const match of source.matchAll(ASSET_PATH)) {
                const assetPath = match[1];
                if (!existsSync(join(PUBLIC_ROOT, assetPath))) {
                    missing.push(`${file.replace(SERVER_ROOT, 'server')} -> ${assetPath}`);
                }
            }
        }

        expect(missing).toEqual([]);
    });
});
