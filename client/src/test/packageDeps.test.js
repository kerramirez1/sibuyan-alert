import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const clientDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pkg = JSON.parse(readFileSync(join(clientDir, 'package.json'), 'utf8'));

describe('client package dependencies', () => {
    test('framer-motion is fully removed (bundle bytes stay out)', () => {
        expect(pkg.dependencies || {}).not.toHaveProperty('framer-motion');
        expect(pkg.devDependencies || {}).not.toHaveProperty('framer-motion');
        expect(pkg.peerDependencies || {}).not.toHaveProperty('framer-motion');
    });
});
