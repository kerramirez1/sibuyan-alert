/**
 * RiskZoneMarkerPin
 *
 * A monochromatic red "high-risk zone" marker: a solid red core dot with a
 * continuous, smooth ripple radiating outwards from behind it.
 *
 * Design rules baked in:
 *  - Pure red palette only — `red-600` core, `red-500/40` waves. No white
 *    border, no outline, no non-red accent. This keeps the hazard pin visually
 *    distinct from the operational status pins, which own blue / amber /
 *    violet / cyan / green (see `src/utils/mapMarkerVisuals.js`).
 *  - Ripples are filled discs that scale up and fade to transparent, so the
 *    wave reads as a soft halo instead of a hard ring.
 *  - Animation is pure Tailwind (`animate-risk-ripple`, defined in
 *    `tailwind.config.js`). The cycle length comes from the
 *    `--risk-ripple-duration` CSS variable so `pulseSpeed` can retune it at
 *    runtime — Tailwind's JIT cannot emit dynamic arbitrary values built from
 *    a template literal, so the variable (not a class name) carries the value.
 *  - Honours `prefers-reduced-motion`: the ripples are hidden and the solid
 *    red core stays put, so the marker still reads without any motion.
 *
 * @param {'sm'|'md'|'lg'} [size='md']  Core dot and ripple footprint.
 * @param {number} [pulseSpeed=1]       Speed multiplier. 1 = one ripple cycle
 *                                      every 2s, 2 = twice as fast, 0.5 = half
 *                                      speed. Clamped to a sane minimum.
 * @param {number} [ripples=3]          Number of staggered waves. 2–4 reads best;
 *                                      3 gives an unbroken, continuous ripple.
 * @param {string} [className]          Extra classes — use this for absolute
 *                                      placement over a map or dashboard.
 * @param {string} [dotClassName]       Extra classes for the red core only.
 */
export const RiskZoneMarkerPin = ({
    size = 'md',
    pulseSpeed = 1,
    ripples = 3,
    className = '',
    dotClassName = '',
    ...props
}) => {
    const sizePreset = {
        sm: { core: 'h-2.5 w-2.5', footprint: 'h-6 w-6' },
        md: { core: 'h-4 w-4', footprint: 'h-9 w-9' },
        lg: { core: 'h-6 w-6', footprint: 'h-14 w-14' },
    }[size] || { core: 'h-4 w-4', footprint: 'h-9 w-9' };

    // `pulseSpeed` is a multiplier, so a bigger number means a shorter cycle.
    const speed = Number(pulseSpeed);
    const cycleSeconds = 2 / (Number.isFinite(speed) && speed > 0 ? speed : 1);

    const waveCount = Math.max(1, Math.min(6, Math.round(Number(ripples) || 3)));

    // Negative delays start each wave part-way through its cycle, so the ripple
    // is already continuous on the very first frame (no "dead" opening beat).
    const waveDelays = Array.from(
        { length: waveCount },
        (_, index) => -(index * cycleSeconds) / waveCount,
    );

    const { style: styleProp, ...rest } = props;

    return (
        <span
            className={`relative inline-flex shrink-0 items-center justify-center ${sizePreset.footprint} ${className}`.trim()}
            style={{ '--risk-ripple-duration': `${cycleSeconds}s`, ...styleProp }}
            {...rest}
        >
            {waveDelays.map((delay, index) => (
                <span
                    key={index}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-full bg-red-500/40 motion-safe:animate-risk-ripple motion-reduce:hidden"
                    style={{ animationDelay: `${delay}s` }}
                />
            ))}

            {/* Solid red core — no border, no outline, no shadow. */}
            <span className={`relative z-10 rounded-full bg-red-600 ${sizePreset.core} ${dotClassName}`.trim()} />
        </span>
    );
};

export default RiskZoneMarkerPin;
