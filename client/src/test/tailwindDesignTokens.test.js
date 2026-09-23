import { describe, expect, test } from 'vitest';
import config from '../../tailwind.config.js';

const extend = config.theme?.extend ?? {};

/**
 * The class vocabulary in `src/` follows the Tailwind v4 scale, which names the
 * subtle end of each scale `2xs`/`xs`; this build runs Tailwind 3.4. There, an
 * undefined utility is dropped from the CSS with no warning and no error — the
 * card simply renders flat and the scrim simply has no blur. These tokens are
 * therefore load-bearing, and this is the only place that can assert them.
 */
describe('design tokens behind the v4 class names used in src/', () => {
    test.each([
        ['boxShadow', '2xs'],
        ['boxShadow', 'xs'],
        ['backdropBlur', 'xs'],
        ['borderRadius', 'xs'],
    ])('defines %s.%s', (scale, token) => {
        expect(extend[scale]?.[token]).toBeTruthy();
    });
});
