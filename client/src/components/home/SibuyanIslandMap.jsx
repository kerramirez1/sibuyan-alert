import { memo } from 'react';

/**
 * Displays the actual Sibuyan Island municipality map image.
 * Source file: /public/icons/Municipality.png
 */
const SibuyanIslandMap = memo(() => (
    <div
        className="relative mx-auto w-full max-w-[210px] min-[430px]:max-w-[270px] sm:max-w-[360px] lg:max-w-[450px] xl:max-w-[500px]"
        role="img"
        aria-label="Map of Sibuyan Island showing Cajidiocan, Magdiwang, and San Fernando municipalities"
        data-testid="sibuyan-island-map"
    >
        {/* Ambient radial emerald glow */}
        <div
            className="absolute -inset-6 -z-10 rounded-full bg-emerald-400/30 blur-3xl dark:bg-emerald-500/20"
            aria-hidden="true"
        />

        {/* Rounded picture container */}
        <div className="overflow-hidden rounded-2xl border border-emerald-900/10 bg-white/90 p-2 shadow-[0_20px_60px_-15px_rgba(9,23,17,0.35)] transition-all duration-300 hover:shadow-[0_25px_70px_-12px_rgba(9,23,17,0.45)] sm:rounded-3xl sm:p-3.5 dark:border-white/10 dark:bg-[#101c19]/90">
            <img
                src="/icons/Municipality.png"
                alt="Sibuyan Island municipality boundaries — Cajidiocan, Magdiwang, and San Fernando"
                className="block h-auto w-full rounded-xl object-contain sm:rounded-2xl"
                loading="eager"
                decoding="async"
                width={640}
                height={530}
            />
        </div>
    </div>
));

SibuyanIslandMap.displayName = 'SibuyanIslandMap';

export default SibuyanIslandMap;
