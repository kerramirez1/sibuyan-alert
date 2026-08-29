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
        {/* Flat hairline frame — no decorative corner brackets/crosshairs. */}
        <div className="relative border border-emerald-900/20 bg-gray-50/50 p-3 sm:p-4 dark:border-emerald-400/20 dark:bg-[#0a1410]">
            <img
                src="/icons/Municipality.png"
                alt="Sibuyan Island municipality boundaries — Cajidiocan, Magdiwang, and San Fernando"
                className="block h-auto w-full object-contain"
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
