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
        {/* Restrained ambient emerald glow (kept subtle; the map is the focus) */}
        <div
            className="absolute -inset-5 -z-10 rounded-full bg-emerald-400/15 blur-2xl dark:bg-emerald-500/10"
            aria-hidden="true"
        />

        {/* Light picture frame: thin border + gentle shadow, restrained radius */}
        <div className="overflow-hidden rounded-xl border border-[#dbeae1] bg-white p-1 shadow-[0_8px_24px_-18px_rgba(9,23,17,0.28)] sm:rounded-2xl sm:p-1.5 lg:p-1 dark:border-[#1c3428] dark:bg-[#101c19]">
            <img
                src="/icons/Municipality.png"
                alt="Sibuyan Island municipality boundaries — Cajidiocan, Magdiwang, and San Fernando"
                className="block h-auto w-full rounded-lg object-contain sm:rounded-xl"
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
